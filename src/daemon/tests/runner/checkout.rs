//! Checkout-mode runs: the project checkout is switched to a task branch
//! only when clean, given back to the branch it was on, and never cleaned up
//! by the Factory when the run leaves work behind.

use super::*;

/// A project whose workflow is committed on origin's `main` and whose
/// checkout sits on the user's own branch `feature/mine`, one commit ahead.
pub(super) async fn checkout_repo(workflow: &str) -> Repo {
    let repo = factory_repo(workflow).await;
    publish_and_branch(&repo).await;
    repo
}

/// Commit and push everything in the checkout to origin's `main`, then put
/// the checkout on `feature/mine`, one commit ahead.
pub(super) async fn publish_and_branch(repo: &Repo) {
    let work = repo.work.as_path();
    git(work, &["add", "."]).await;
    git(work, &["commit", "-q", "-m", "workflow"]).await;
    git(work, &["push", "-q", "origin", "main"]).await;
    git(work, &["checkout", "-q", "-b", "feature/mine"]).await;
    std::fs::write(work.join("mine.txt"), "mine\n").unwrap();
    git(work, &["add", "."]).await;
    git(work, &["commit", "-q", "-m", "mine"]).await;
}

pub(super) fn branch(work: &Path) -> String {
    let out = std::process::Command::new("git")
        .arg("-C")
        .arg(work)
        .args(["symbolic-ref", "--short", "HEAD"])
        .output()
        .unwrap();
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn in_checkout(agent: &str) -> wire::RunnerSettingsPatch {
    wire::RunnerSettingsPatch {
        run_location: Some(wire::RunLocation::Checkout),
        max_concurrent: Some(3),
        ..running_with(agent)
    }
}

pub(super) async fn task(daemon: &DaemonHandle, id: &str) -> Task {
    daemon
        .tasks()
        .await
        .into_iter()
        .find(|t| t.id == id)
        .expect("task exists")
}

/// A run in the project checkout works on a task branch from origin's main,
/// verifies the running app, opens a draft PR, reports it in the pipeline's
/// summary, and puts the checkout back on the user's branch.
#[tokio::test]
async fn a_checkout_run_delivers_and_returns_to_the_original_branch() {
    let dir = tempfile::tempdir().unwrap();
    let verifier = wf_agent(&dir, "verify.state", "verify-pass");
    let reviewer = wf_agent(&dir, "rev.state", "approve");
    let repo = checkout_repo(&format!(
        "name: Checkout flow\nverify:\n  agent: {verifier}\nreview:\n  reviewers:\n    - agent: {reviewer}\n"
    ))
    .await;
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let mut events = daemon.subscribe();
    let opened = fake_opener(&daemon).await;
    let item = create_item(&daemon, "checkout change", "high").await;
    settings(&daemon, in_checkout(&writing_agent())).await;
    enqueue(&daemon, &[&item]).await;

    let delivered = wait_run(&mut events, "delivered", |run| {
        run.item_id == item.id && run.outcome == wire::ItemRunOutcome::Delivered
    })
    .await;
    let task_id = delivered.task_id.clone().unwrap();
    let parent = task(&daemon, &task_id).await;
    assert!(parent.worktree.is_none(), "ran in the project checkout");
    assert_eq!(parent.base_branch.as_deref(), Some("main"));
    {
        let opened = opened.lock().unwrap();
        let (_, body, base) = &opened[0];
        assert_eq!(base.as_deref(), Some("main"));
        assert!(body.contains("Verification passed"), "{body}");
    }
    let pushed = origin_branches(&repo.origin);
    assert!(
        pushed.contains(&format!("warpforge/task/{task_id}")),
        "{pushed}"
    );

    wait_status(&daemon, "checkout given back", |s| s.checkout.is_none()).await;
    assert_eq!(branch(&repo.work), "feature/mine");
    assert!(repo.work.join("mine.txt").exists());
    assert!(!repo.work.join("factory-change.txt").exists());

    let report = task(&daemon, &task_id)
        .await
        .workflow_run
        .and_then(|w| w.report)
        .unwrap_or_default();
    assert!(
        report.contains("Draft PR #7 opened: https://github.com/o/r/pull/7"),
        "{report}"
    );
    assert!(!report.contains("commit when ready"), "{report}");
    daemon.shutdown().await;
}

/// Uncommitted work in the checkout holds the queue and is left alone; once
/// it is gone the next tick starts the item.
#[tokio::test]
async fn a_dirty_checkout_holds_the_queue_and_is_left_alone() {
    let repo = checkout_repo("name: Hold flow\n").await;
    let lead = wf_agent(&repo.dir, "lead.state", "question");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    std::fs::write(repo.work.join("scratch.txt"), "my notes\n").unwrap();
    let item = create_item(&daemon, "held", "none").await;
    settings(&daemon, in_checkout(&lead)).await;
    enqueue(&daemon, &[&item]).await;

    let held = wait_status(&daemon, "dirty checkout holds", |s| {
        matches!(
            s.hold,
            Some(wire::RunnerWait::CheckoutBusy {
                cause: wire::CheckoutBusyCause::Dirty,
                ..
            })
        )
    })
    .await;
    assert!(held.checkout.is_none());
    assert_eq!(
        entry(&held, &item).unwrap().state,
        wire::RunnerEntryState::Queued
    );
    assert_eq!(branch(&repo.work), "feature/mine");
    assert_eq!(
        std::fs::read_to_string(repo.work.join("scratch.txt")).unwrap(),
        "my notes\n"
    );

    std::fs::remove_file(repo.work.join("scratch.txt")).unwrap();
    daemon.send(Command::Runner(RunnerCommand::Tick)).await;
    let running = wait_status(&daemon, "starts once clean", |s| {
        s.checkout
            .as_ref()
            .is_some_and(|l| l.state == wire::CheckoutLeaseState::Running)
    })
    .await;
    let lease = running.checkout.unwrap();
    assert_eq!(lease.return_branch.as_deref(), Some("feature/mine"));
    assert_eq!(branch(&repo.work), lease.branch);
    daemon.shutdown().await;
}

/// A run that fails with the agent's edits uncommitted leaves the checkout on
/// the task branch with the edits intact, holds every start, and says what to
/// do; once the person cleans up, Try again gives the checkout back.
#[tokio::test]
async fn a_failed_run_with_leftover_edits_holds_the_checkout_and_discards_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let reviewer = wf_agent(&dir, "rev.state", "garbage");
    let repo = checkout_repo(&format!(
        "name: Junk flow\nreview:\n  reviewers:\n    - agent: {reviewer}\n"
    ))
    .await;
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let mut events = daemon.subscribe();
    let item = create_item(&daemon, "breaks", "none").await;
    settings(&daemon, in_checkout(&writing_agent())).await;
    enqueue(&daemon, &[&item]).await;

    let failed = wait_run(&mut events, "failed", |run| {
        run.item_id == item.id && run.outcome == wire::ItemRunOutcome::Failed
    })
    .await;
    let held = wait_status(&daemon, "checkout held", |s| {
        s.checkout
            .as_ref()
            .is_some_and(|l| l.state == wire::CheckoutLeaseState::Held)
    })
    .await;
    let lease = held.checkout.clone().unwrap();
    let reason = lease.held_reason.clone().unwrap();
    assert!(
        reason.contains(&format!("left your project folder on {}", lease.branch))
            && reason.contains("uncommitted changes"),
        "{reason}"
    );
    let task_id = failed.task_id.clone().unwrap();
    assert_eq!(
        held.hold,
        Some(wire::RunnerWait::CheckoutHeld {
            reason: reason.clone(),
            task_id: Some(task_id.clone()),
        })
    );
    assert_eq!(branch(&repo.work), lease.branch);
    assert!(
        repo.work.join("factory-change.txt").exists(),
        "nothing discarded"
    );
    let parent = task(&daemon, &task_id).await;
    assert_eq!(parent.blocked_reason.as_deref(), Some(reason.as_str()));
    assert_eq!(
        parent.blocked_kind,
        Some(wire::TaskBlockedKind::CheckoutHeld)
    );

    std::fs::remove_file(repo.work.join("factory-change.txt")).unwrap();
    ask(&daemon, |reply| RunnerCommand::RetryCheckout {
        project: "demo".into(),
        reply,
    })
    .await
    .unwrap();
    wait_status(&daemon, "given back", |s| s.checkout.is_none()).await;
    assert_eq!(branch(&repo.work), "feature/mine");
    assert!(task(&daemon, &task_id).await.blocked_kind.is_none());
    daemon.shutdown().await;
}

/// The lease survives a restart with its run parked at a question; Stop all
/// then ends the run, sends the item back and returns the checkout.
#[tokio::test]
async fn the_lease_survives_a_restart_and_stop_returns_the_checkout() {
    let repo = checkout_repo("name: Restart flow\n").await;
    let lead = wf_agent(&repo.dir, "lead.state", "question");
    let db_path = repo.dir.path().join("warpforge.db");
    let daemon = Daemon::spawn(repo.projects.clone(), Store::open_at(&db_path).ok());
    let mut events = daemon.subscribe();
    let item = create_item(&daemon, "parked", "none").await;
    settings(&daemon, in_checkout(&lead)).await;
    enqueue(&daemon, &[&item]).await;
    let running = wait_status(&daemon, "running in the checkout", |s| {
        s.checkout
            .as_ref()
            .is_some_and(|l| l.state == wire::CheckoutLeaseState::Running)
    })
    .await;
    let task_id = entry(&running, &item).unwrap().task_id.clone();
    wait_for_parent(&mut events, &task_id, "asking", |t| {
        t.workflow_run.as_ref().is_some_and(|w| w.waiting.is_some())
    })
    .await;
    daemon.shutdown().await;

    let daemon = Daemon::spawn(repo.projects.clone(), Store::open_at(&db_path).ok());
    let restored = status(&daemon).await;
    let lease = restored.checkout.clone().expect("lease restored");
    assert_eq!(lease.state, wire::CheckoutLeaseState::Running);
    assert_eq!(lease.task_id, task_id);
    assert_eq!(branch(&repo.work), lease.branch);
    assert_eq!(
        entry(&restored, &item).unwrap().state,
        wire::RunnerEntryState::Running
    );

    let stopped = ask(&daemon, |reply| RunnerCommand::Stop {
        project: "demo".into(),
        reply,
    })
    .await
    .unwrap();
    assert!(entry(&stopped, &item).is_none(), "nothing is queued again");
    assert_eq!(item_status(&daemon, &item.id).await, "todo");
    assert_eq!(
        task(&daemon, &task_id).await.status,
        TaskStatus::Interrupted
    );
    wait_status(&daemon, "given back", |s| s.checkout.is_none()).await;
    assert_eq!(branch(&repo.work), "feature/mine");
    let branches = std::process::Command::new("git")
        .arg("-C")
        .arg(&repo.work)
        .args(["branch", "--list", "warpforge/task/*"])
        .output()
        .unwrap();
    assert!(
        String::from_utf8_lossy(&branches.stdout).trim().is_empty(),
        "a task branch with no commits is deleted"
    );
    daemon.shutdown().await;
}
