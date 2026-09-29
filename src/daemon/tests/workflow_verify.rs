use super::*;
use warpforge_protocol as wire;

fn verify_yaml(verifier: &str, reviewer: &str, extra: &str) -> String {
    format!(
        "name: Verify flow\nverify:\n  agent: {verifier}\n{extra}review:\n  max_rounds: 2\n  reviewers:\n    - agent: {reviewer}\n"
    )
}

fn node_kinds(task: &Task) -> Vec<wire::OrchNodeKind> {
    task.orchestration_graph
        .as_ref()
        .map(|g| g.nodes.iter().map(|n| n.kind.clone()).collect())
        .unwrap_or_default()
}

fn is_stage(task: &Task, stage: wire::WorkflowStage) -> bool {
    task.workflow_run.as_ref().is_some_and(|w| w.stage == stage)
}

/// A workflow project that is a git repository, so the engine can tell
/// whether a fix changed the working copy. Mock-agent state files are ignored.
async fn git_workflow_project() -> (tempfile::TempDir, Vec<crate::registry::ProjectEntry>) {
    let (dir, projects) = workflow_project("name: placeholder\n");
    std::fs::write(dir.path().join(".gitignore"), "*.state\n.warpforge/\n").unwrap();
    let git = |args: &[&str]| {
        std::process::Command::new("git")
            .args(args)
            .current_dir(dir.path())
            .env("GIT_AUTHOR_NAME", "test")
            .env("GIT_AUTHOR_EMAIL", "t@t")
            .env("GIT_COMMITTER_NAME", "test")
            .env("GIT_COMMITTER_EMAIL", "t@t")
            .output()
            .unwrap()
    };
    git(&["init"]);
    git(&["add", "."]);
    git(&["commit", "-m", "init"]);
    (dir, projects)
}

async fn decide(daemon: &DaemonHandle, parent_id: &str, decision: wire::WorkflowDecision) {
    let (tx, rx) = tokio::sync::oneshot::channel();
    daemon
        .send(Command::WorkflowDecide {
            task: parent_id.into(),
            decision,
            rounds: None,
            note: None,
            barrier_id: None,
            reply: tx,
        })
        .await;
    rx.await.unwrap().expect("decision accepted");
}

/// implement → verify FAIL → fix → verify PASS → review rejects → fix that
/// edits → verify PASS → review approves. A failed verification goes to the
/// fixer as findings, and a fix that changed the code is verified again.
#[tokio::test]
async fn verify_failure_goes_to_fix_and_each_fix_is_verified_again() {
    let (dir, projects) = git_workflow_project().await;
    let verifier = wf_agent(&dir, "verify.state", "verify-fail verify-pass verify-pass");
    let reviewer = wf_agent(&dir, "rev.state", "reject approve");
    std::fs::write(
        dir.path().join(".warpforge/workflows/test.yaml"),
        verify_yaml(&verifier, &reviewer, ""),
    )
    .unwrap();
    let lead = wf_agent(&dir, "impl.state", "impl fix fix-edit");

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(projects, store);
    let mut events = daemon.subscribe();
    let parent_id = create_workflow_task(&daemon, &lead).await;
    let done = wait_for_parent(&mut events, &parent_id, "pipeline done", |t| {
        is_stage(t, wire::WorkflowStage::Done)
    })
    .await;

    use wire::OrchNodeKind::*;
    assert_eq!(
        node_kinds(&done),
        vec![Implement, Verify, Fix, Verify, Review, Fix, Verify, Review]
    );
    let run = done.workflow_run.unwrap();
    let verdicts: Vec<_> = run.verifications.iter().map(|v| v.verdict).collect();
    use wire::WorkflowVerifyVerdict::*;
    assert_eq!(verdicts, vec![Some(Fail), Some(Pass), Some(Pass)]);
    assert_eq!(run.verifications[0].checklist[0].step, "Save the form");
    let report = run.report.expect("the final report is on the run");
    assert!(report.contains("**Verification: PASS**"), "{report}");
    assert!(report.contains("VERIFY-PASS the flow works"), "{report}");

    // The first fix repairs what verification found, not a review.
    let snapshot = daemon.snapshot().await;
    let graph = done.orchestration_graph.as_ref().unwrap();
    let prompt_of = |node: usize| {
        let id = graph.nodes[node].task_id.as_deref().unwrap();
        snapshot
            .tasks
            .iter()
            .find(|t| t.id == id)
            .map(|t| t.prompt.clone())
            .unwrap()
    };
    let first_fix = prompt_of(2);
    assert!(first_fix.contains("VERIFY-FINDING: saving does not persist"));
    assert!(first_fix.contains("QA verification stage"));
    // The second verification re-checks the first one's failures; the one
    // after the review-driven fix starts from a pass and has none to re-check.
    assert!(prompt_of(3).contains("re-check every failure"));
    assert!(prompt_of(3).contains("Save the form"));
    assert!(!prompt_of(6).contains("re-check every failure"));
    // The review-driven fix is a review repair.
    assert!(prompt_of(5).contains("Reviewers found"));
}
/// A review-driven fix that changed nothing goes straight back to review:
/// the last pass still describes the code.
#[tokio::test]
async fn a_fix_that_changed_nothing_is_not_verified_again() {
    let (dir, projects) = git_workflow_project().await;
    let verifier = wf_agent(&dir, "verify.state", "verify-pass");
    let reviewer = wf_agent(&dir, "rev.state", "reject approve");
    std::fs::write(
        dir.path().join(".warpforge/workflows/test.yaml"),
        verify_yaml(&verifier, &reviewer, ""),
    )
    .unwrap();
    let lead = wf_agent(&dir, "impl.state", "impl fix");

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(projects, store);
    let mut events = daemon.subscribe();
    let parent_id = create_workflow_task(&daemon, &lead).await;
    let done = wait_for_parent(&mut events, &parent_id, "pipeline done", |t| {
        is_stage(t, wire::WorkflowStage::Done)
    })
    .await;
    use wire::OrchNodeKind::*;
    assert_eq!(
        node_kinds(&done),
        vec![Implement, Verify, Review, Fix, Review]
    );
}

/// A required verify that fails on every attempt parks at a verify barrier;
/// `finish` continues to review without a pass and the report says so.
#[tokio::test]
async fn out_of_attempts_waits_for_the_user_then_continues_to_review() {
    let (dir, projects) = workflow_project("name: placeholder\n");
    let verifier = wf_agent(&dir, "verify.state", "verify-fail");
    let reviewer = wf_agent(&dir, "rev.state", "approve");
    std::fs::write(
        dir.path().join(".warpforge/workflows/test.yaml"),
        verify_yaml(&verifier, &reviewer, "  max_attempts: 1\n"),
    )
    .unwrap();
    let lead = wf_agent(&dir, "impl.state", "impl");

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(projects, store);
    let mut events = daemon.subscribe();
    let parent_id = create_workflow_task(&daemon, &lead).await;
    let parked = wait_for_parent(&mut events, &parent_id, "verify barrier", |t| {
        t.workflow_run
            .as_ref()
            .and_then(|w| w.waiting.as_ref())
            .is_some_and(|w| w.kind == wire::WorkflowWaitKind::Limit)
    })
    .await;
    assert_eq!(parked.status, TaskStatus::Waiting);
    let waiting = parked.workflow_run.unwrap().waiting.unwrap();
    assert_eq!(waiting.stage, Some(wire::WorkflowStage::Verify));
    assert!(waiting.question.unwrap().contains("failed 1 time(s)"));

    decide(&daemon, &parent_id, wire::WorkflowDecision::Finish).await;
    let done = wait_for_parent(&mut events, &parent_id, "pipeline done", |t| {
        is_stage(t, wire::WorkflowStage::Done)
    })
    .await;
    use wire::OrchNodeKind::*;
    assert_eq!(node_kinds(&done), vec![Implement, Verify, Review]);
    let report = done.workflow_run.unwrap().report.unwrap();
    assert!(report.contains("did not pass verification"), "{report}");
    assert!(report.contains("VERIFY-FINDING"), "{report}");
}

/// `required: false`: a verify that cannot run is noted and review goes on.
#[tokio::test]
async fn an_optional_verify_that_cannot_run_does_not_hold_the_pipeline() {
    let (dir, projects) = workflow_project("name: placeholder\n");
    let verifier = wf_agent(&dir, "verify.state", "verify-blocked");
    let reviewer = wf_agent(&dir, "rev.state", "approve");
    std::fs::write(
        dir.path().join(".warpforge/workflows/test.yaml"),
        verify_yaml(&verifier, &reviewer, "  required: false\n"),
    )
    .unwrap();
    let lead = wf_agent(&dir, "impl.state", "impl");

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(projects, store);
    let mut events = daemon.subscribe();
    let parent_id = create_workflow_task(&daemon, &lead).await;
    let done = wait_for_parent(&mut events, &parent_id, "pipeline done", |t| {
        is_stage(t, wire::WorkflowStage::Done)
    })
    .await;
    let run = done.workflow_run.unwrap();
    assert_eq!(
        run.verifications[0].verdict,
        Some(wire::WorkflowVerifyVerdict::Blocked)
    );
    assert!(run.verifications[0].summary.contains("VERIFY-BLOCKED"));
    assert_eq!(run.verdict, Some(wire::WorkflowVerdict::Approve));
}

/// A screenshot taken by the running verify stage is kept as evidence and
/// listed on its verification; anyone else's is not.
#[tokio::test]
async fn a_verify_stage_screenshot_is_kept_as_evidence() {
    let (dir, projects) = workflow_project("name: placeholder\n");
    let verifier = wf_agent(&dir, "verify.state", "slow-verify-pass");
    let reviewer = wf_agent(&dir, "rev.state", "approve");
    std::fs::write(
        dir.path().join(".warpforge/workflows/test.yaml"),
        verify_yaml(&verifier, &reviewer, ""),
    )
    .unwrap();
    let lead = wf_agent(&dir, "impl.state", "impl");

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(projects, store);
    let mut events = daemon.subscribe();
    let parent_id = create_workflow_task(&daemon, &lead).await;
    let verifying = wait_for_parent(&mut events, &parent_id, "verify running", |t| {
        is_stage(t, wire::WorkflowStage::Verify)
    })
    .await;
    let verify_child = verifying.orchestration_graph.as_ref().unwrap().nodes[1]
        .task_id
        .clone()
        .unwrap();
    let implement_child = verifying.orchestration_graph.as_ref().unwrap().nodes[0]
        .task_id
        .clone()
        .unwrap();

    let (name, path) = daemon
        .keep_workflow_evidence(&verify_child, "image/png")
        .await
        .expect("a running verify stage keeps its screenshots");
    assert_eq!(name, "shot-1.png");
    crate::daemon::workflow::evidence::write(&path, "AAEC").unwrap();
    assert!(daemon
        .keep_workflow_evidence(&implement_child, "image/png")
        .await
        .is_none());

    let done = wait_for_parent(&mut events, &parent_id, "pipeline done", |t| {
        is_stage(t, wire::WorkflowStage::Done)
    })
    .await;
    let run = done.workflow_run.unwrap();
    assert_eq!(run.verifications[0].evidence[0].name, "shot-1.png");
    assert!(run.report.unwrap().contains("Screenshots are stored in"));
    let image = crate::daemon::workflow::evidence::read(&parent_id, "shot-1.png").unwrap();
    assert_eq!(image.content_type, "image/png");
    crate::daemon::workflow::evidence::remove_run(&parent_id);
    let root = crate::daemon::workflow::evidence::run_dir(&parent_id).unwrap();
    let _ = std::fs::remove_dir(root.parent().unwrap());
}

/// Services run from the main checkout, so a task in its own worktree is not
/// verified against them: the stage says why without starting an agent, and a
/// required verify waits for the user.
#[tokio::test]
async fn a_worktree_task_is_refused_verification_with_the_reason() {
    let (dir, projects) = git_workflow_project().await;
    let verifier = wf_agent(&dir, "verify.state", "verify-pass");
    let reviewer = wf_agent(&dir, "rev.state", "approve");
    std::fs::write(
        dir.path().join(".warpforge/workflows/test.yaml"),
        verify_yaml(&verifier, &reviewer, ""),
    )
    .unwrap();
    let lead = wf_agent(&dir, "impl.state", "impl");

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(projects, store);
    let mut events = daemon.subscribe();
    let (tx, rx) = tokio::sync::oneshot::channel();
    daemon
        .send(Command::CreateWorkflowTask {
            project: "demo".into(),
            prompt: "do the thing".into(),
            agent: lead,
            tags: vec![],
            worktree: true,
            worktree_base: Default::default(),
            workflow: "test".into(),
            attachments: vec![],
            default_model: None,
            include_runtime_context: false,
            config_overrides: std::collections::HashMap::new(),
            parent_task_id: None,
            backlog_item_id: None,
            reply: tx,
        })
        .await;
    let parent_id = rx.await.unwrap().expect("workflow task created");
    let parked = wait_for_parent(&mut events, &parent_id, "verify barrier", |t| {
        t.workflow_run
            .as_ref()
            .and_then(|w| w.waiting.as_ref())
            .is_some_and(|w| w.stage == Some(wire::WorkflowStage::Verify))
    })
    .await;
    let run = parked.workflow_run.clone().unwrap();
    assert_eq!(run.verifications.len(), 1);
    assert_eq!(run.verifications[0].task_id, None);
    assert_eq!(
        run.verifications[0].verdict,
        Some(wire::WorkflowVerifyVerdict::Blocked)
    );
    assert!(run.verifications[0]
        .summary
        .contains("Per-worktree services are not supported yet"));
    assert!(run
        .waiting
        .unwrap()
        .question
        .unwrap()
        .starts_with("verification could not run"));
    // No verify agent ever started.
    use wire::OrchNodeKind::*;
    assert_eq!(node_kinds(&parked), vec![Implement]);
    assert!(!dir.path().join("verify.state").exists());

    decide(&daemon, &parent_id, wire::WorkflowDecision::Stop).await;
}
