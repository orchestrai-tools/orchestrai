use super::*;
use warpforge_protocol as wire;

async fn set_limits(daemon: &DaemonHandle, accounts: Vec<wire::AgentAccountLimits>) {
    daemon.send(Command::AgentLimitsUpdated { accounts }).await;
}

async fn resume(daemon: &DaemonHandle, parent_id: &str) {
    let (tx, rx) = tokio::sync::oneshot::channel();
    daemon
        .send(Command::WorkflowResume {
            task: parent_id.to_string(),
            note: None,
            reply: tx,
        })
        .await;
    rx.await.unwrap().expect("resume accepted");
}

fn paused_at(task: &Task, stage: wire::WorkflowStage) -> bool {
    task.workflow_run.as_ref().is_some_and(|w| {
        w.stage == stage
            && w.waiting
                .as_ref()
                .is_some_and(|w| w.kind == wire::WorkflowWaitKind::Paused)
    })
}

async fn children(daemon: &DaemonHandle, parent_id: &str) -> usize {
    daemon
        .tasks()
        .await
        .iter()
        .filter(|t| t.parent_task_id.as_deref() == Some(parent_id))
        .count()
}

/// A stage whose agent's account is out of quota is not started: the run
/// parks at the pause barrier, and resuming after the reset runs it.
#[tokio::test]
async fn an_exhausted_stage_agent_parks_the_pipeline_until_resumed() {
    let (dir, projects) = workflow_project("name: placeholder\n");
    let reviewer = wf_agent(&dir, "rev.state", "approve");
    std::fs::write(
        dir.path().join(".warpforge/workflows/test.yaml"),
        format!("name: Quota flow\nreview:\n  reviewers:\n    - agent: {reviewer}\n"),
    )
    .unwrap();
    let lead = wf_agent(&dir, "lead.state", "impl");

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(projects, store);
    let mut events = daemon.subscribe();
    set_limits(
        &daemon,
        vec![crate::daemon::limits::gate::exhausted_row(&lead)],
    )
    .await;

    let parent_id = create_workflow_task(&daemon, &lead).await;
    let parked = wait_for_parent(&mut events, &parent_id, "parked on quota", |t| {
        paused_at(t, wire::WorkflowStage::Implement)
    })
    .await;
    assert_eq!(parked.status, TaskStatus::Waiting);
    assert_eq!(
        children(&daemon, &parent_id).await,
        0,
        "no stage was started"
    );

    // Still exhausted: resuming re-checks and parks again without a child.
    resume(&daemon, &parent_id).await;
    let tasks = daemon.tasks().await;
    let parent = tasks.iter().find(|t| t.id == parent_id).unwrap();
    assert!(paused_at(parent, wire::WorkflowStage::Implement));
    assert_eq!(children(&daemon, &parent_id).await, 0);

    set_limits(&daemon, Vec::new()).await;
    resume(&daemon, &parent_id).await;
    wait_for_parent(&mut events, &parent_id, "pipeline done", |t| {
        t.workflow_run
            .as_ref()
            .is_some_and(|w| w.stage == wire::WorkflowStage::Done)
    })
    .await;
    daemon.shutdown().await;
}

/// An exhausted reviewer holds the run before the review round, and the
/// round is not counted until it actually starts.
#[tokio::test]
async fn an_exhausted_reviewer_parks_before_the_review_round() {
    let (dir, projects) = workflow_project("name: placeholder\n");
    let reviewer = wf_agent(&dir, "rev.state", "approve");
    std::fs::write(
        dir.path().join(".warpforge/workflows/test.yaml"),
        format!("name: Quota flow\nreview:\n  reviewers:\n    - agent: {reviewer}\n"),
    )
    .unwrap();
    let lead = wf_agent(&dir, "lead.state", "impl");

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(projects, store);
    let mut events = daemon.subscribe();
    set_limits(
        &daemon,
        vec![crate::daemon::limits::gate::exhausted_row(&reviewer)],
    )
    .await;

    let parent_id = create_workflow_task(&daemon, &lead).await;
    let parked = wait_for_parent(&mut events, &parent_id, "parked before review", |t| {
        paused_at(t, wire::WorkflowStage::Review)
    })
    .await;
    assert_eq!(parked.workflow_run.unwrap().round, 0);
    assert_eq!(children(&daemon, &parent_id).await, 1, "only implement ran");

    set_limits(&daemon, Vec::new()).await;
    resume(&daemon, &parent_id).await;
    let done = wait_for_parent(&mut events, &parent_id, "pipeline done", |t| {
        t.workflow_run
            .as_ref()
            .is_some_and(|w| w.stage == wire::WorkflowStage::Done)
    })
    .await;
    assert_eq!(done.workflow_run.unwrap().round, 1);
    daemon.shutdown().await;
}
