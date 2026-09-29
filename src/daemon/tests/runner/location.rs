//! Per-item run location: a mixed queue runs at most one item in the project
//! checkout while worktree items run beside it, and a checkout the Factory
//! cannot use holds only the items that need it.

use super::checkout::{branch, checkout_repo, publish_and_branch, task};
use super::*;

use warpforge_protocol::EntryRunLocation as Place;

async fn set_location(
    daemon: &DaemonHandle,
    item: &wire::BacklogItem,
    run_location: Place,
) -> Result<wire::RunnerStatus, String> {
    ask(daemon, |reply| RunnerCommand::SetLocation {
        project: "demo".into(),
        item_id: item.id.clone(),
        run_location,
        reply,
    })
    .await
}

fn start_with(
    agent: &str,
    max_concurrent: u32,
    at: wire::RunLocation,
) -> wire::RunnerSettingsPatch {
    wire::RunnerSettingsPatch {
        max_concurrent: Some(max_concurrent),
        run_location: Some(at),
        ..running_with(agent)
    }
}

fn state_of(
    status: &wire::RunnerStatus,
    item: &wire::BacklogItem,
) -> Option<wire::RunnerEntryState> {
    entry(status, item).map(|e| e.state)
}

/// With `auto`, the item whose workflow verifies runs in the project
/// checkout and the other in a worktree, both at once; a third waits for a
/// slot, and each attempt records where it ran.
#[tokio::test]
async fn auto_puts_a_verifying_workflow_in_the_checkout_beside_a_worktree_run() {
    let repo = factory_repo("name: Plain flow\n").await;
    std::fs::write(
        repo.work.join(".warpforge/workflows/verified.yaml"),
        "name: Verified flow\nverify:\n  required: true\n",
    )
    .unwrap();
    publish_and_branch(&repo).await;
    let lead = wf_agent(&repo.dir, "lead.state", "question");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let verifying = create_item(&daemon, "verifying", "high").await;
    let plain = create_item(&daemon, "plain", "none").await;
    let later = create_item(&daemon, "later", "none").await;
    ask(&daemon, |reply| RunnerCommand::Enqueue {
        project: "demo".into(),
        item_ids: vec![verifying.id.clone()],
        workflow: Some("verified".into()),
        agent: None,
        model: None,
        run_location: Place::Default,
        origin_task: None,
        reply,
    })
    .await
    .unwrap();
    enqueue(&daemon, &[&plain]).await;
    settings(&daemon, start_with(&lead, 2, wire::RunLocation::Auto)).await;

    let both = wait_status(&daemon, "one checkout and one worktree run", |s| {
        state_of(s, &verifying) == Some(wire::RunnerEntryState::Running)
            && state_of(s, &plain) == Some(wire::RunnerEntryState::Running)
            && s.checkout
                .as_ref()
                .is_some_and(|l| l.state == wire::CheckoutLeaseState::Running)
    })
    .await;
    let in_checkout = entry(&both, &verifying).unwrap();
    let in_worktree = entry(&both, &plain).unwrap();
    assert_eq!(
        in_checkout.resolved_location,
        Some(wire::RunLocation::Checkout)
    );
    assert_eq!(
        in_worktree.resolved_location,
        Some(wire::RunLocation::Worktree)
    );
    let lease = both.checkout.clone().unwrap();
    assert_eq!(lease.item_id, verifying.id);
    assert_eq!(branch(&repo.work), lease.branch);
    let checkout_task = task(&daemon, in_checkout.task_id.as_deref().unwrap()).await;
    assert!(checkout_task.worktree.is_none());
    let worktree_id = in_worktree.task_id.clone().unwrap();
    timeout(Duration::from_secs(30), async {
        while task(&daemon, &worktree_id).await.worktree.is_none() {
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    })
    .await
    .expect("the worktree item gets its own worktree");

    let full = enqueue(&daemon, &[&later]).await;
    assert_eq!(
        state_of(&full, &later),
        Some(wire::RunnerEntryState::Queued)
    );
    assert!(
        full.hold.as_deref().unwrap().contains("2 of 2 run slot"),
        "{full:?}"
    );

    let refused = set_location(&daemon, &verifying, Place::Worktree).await;
    assert!(refused.unwrap_err().contains("already started"));

    let runs = ask(&daemon, |reply| RunnerCommand::Runs {
        project: "demo".into(),
        limit: None,
        reply,
    })
    .await
    .unwrap();
    let ran_at = |item: &wire::BacklogItem| {
        runs.iter()
            .find(|r| r.item_id == item.id)
            .and_then(|r| r.run_location)
    };
    assert_eq!(ran_at(&verifying), Some(wire::RunLocation::Checkout));
    assert_eq!(ran_at(&plain), Some(wire::RunLocation::Worktree));
    daemon.shutdown().await;
}

/// A dirty checkout holds the item that needs it, with the reason on its
/// row, while the worktree item behind it starts; nothing in the checkout is
/// touched.
#[tokio::test]
async fn a_dirty_checkout_holds_only_the_item_that_needs_it() {
    let repo = checkout_repo("name: Plain flow\n").await;
    let lead = wf_agent(&repo.dir, "lead.state", "question");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    std::fs::write(repo.work.join("scratch.txt"), "my notes\n").unwrap();
    let first = create_item(&daemon, "needs the checkout", "high").await;
    let behind = create_item(&daemon, "worktree", "none").await;
    enqueue_at(&daemon, &[&first], Place::Checkout).await;
    enqueue(&daemon, &[&behind]).await;
    settings(&daemon, start_with(&lead, 2, wire::RunLocation::Worktree)).await;

    let held = wait_status(&daemon, "worktree item runs past the held one", |s| {
        state_of(s, &behind) == Some(wire::RunnerEntryState::Running)
            && entry(s, &first)
                .and_then(|e| e.waiting_reason.as_deref())
                .is_some_and(|r| r.contains("uncommitted changes"))
    })
    .await;
    assert_eq!(
        state_of(&held, &first),
        Some(wire::RunnerEntryState::Queued)
    );
    assert!(held.checkout.is_none());
    assert_eq!(branch(&repo.work), "feature/mine");
    assert_eq!(
        std::fs::read_to_string(repo.work.join("scratch.txt")).unwrap(),
        "my notes\n"
    );
    daemon.shutdown().await;
}

/// Two items bound for the checkout never run at once, whatever the
/// concurrency: the second waits on its row for the first.
#[tokio::test]
async fn two_checkout_items_never_run_at_once() {
    let repo = checkout_repo("name: Plain flow\n").await;
    let lead = wf_agent(&repo.dir, "lead.state", "question");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let first = create_item(&daemon, "first", "high").await;
    let second = create_item(&daemon, "second", "none").await;
    enqueue(&daemon, &[&first, &second]).await;
    settings(&daemon, start_with(&lead, 3, wire::RunLocation::Checkout)).await;

    let running = wait_status(&daemon, "first runs in the checkout", |s| {
        s.checkout
            .as_ref()
            .is_some_and(|l| l.state == wire::CheckoutLeaseState::Running)
            && entry(s, &second)
                .and_then(|e| e.waiting_reason.as_deref())
                .is_some_and(|r| r.contains("is running in the project checkout"))
    })
    .await;
    assert_eq!(
        state_of(&running, &first),
        Some(wire::RunnerEntryState::Running)
    );
    assert_eq!(
        state_of(&running, &second),
        Some(wire::RunnerEntryState::Queued)
    );
    assert!(running
        .hold
        .as_deref()
        .is_some_and(|h| h.contains("is running in the project checkout")));

    daemon.send(Command::Runner(RunnerCommand::Tick)).await;
    let later = status(&daemon).await;
    let in_run = later
        .entries
        .iter()
        .filter(|e| e.state == wire::RunnerEntryState::Running)
        .count();
    assert_eq!(in_run, 1);
    daemon.shutdown().await;
}

/// An item's own run location is stored with it, survives a restart, and
/// can be changed while it waits in the queue.
#[tokio::test]
async fn an_item_location_survives_a_restart_and_changes_while_queued() {
    let repo = factory_repo("name: Plain flow\n").await;
    let db_path = repo.dir.path().join("warpforge.db");
    let daemon = Daemon::spawn(repo.projects.clone(), Store::open_at(&db_path).ok());
    let item = create_item(&daemon, "placed", "none").await;
    let queued = enqueue_at(&daemon, &[&item], Place::Checkout).await;
    assert_eq!(entry(&queued, &item).unwrap().run_location, Place::Checkout);
    daemon.shutdown().await;

    let daemon = Daemon::spawn(repo.projects.clone(), Store::open_at(&db_path).ok());
    let restored = status(&daemon).await;
    assert_eq!(
        entry(&restored, &item).unwrap().run_location,
        Place::Checkout
    );
    let moved = set_location(&daemon, &item, Place::Worktree).await.unwrap();
    assert_eq!(entry(&moved, &item).unwrap().run_location, Place::Worktree);
    daemon.shutdown().await;

    let daemon = Daemon::spawn(repo.projects.clone(), Store::open_at(&db_path).ok());
    let again = status(&daemon).await;
    assert_eq!(entry(&again, &item).unwrap().run_location, Place::Worktree);
    daemon.shutdown().await;
}
