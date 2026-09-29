use super::*;

/// Settings, queue order and an in-flight entry survive a daemon restart:
/// the running item keeps its task and its slot, and nothing re-dispatches.
#[tokio::test]
async fn the_queue_and_a_running_item_survive_a_restart() {
    let repo = factory_repo("name: Restart flow\n").await;
    let lead = wf_agent(&repo.dir, "lead.state", "question");
    let db_path = repo.dir.path().join("warpforge.db");
    let daemon = Daemon::spawn(repo.projects.clone(), Store::open_at(&db_path).ok());
    let a = create_item(&daemon, "a", "none").await;
    let b = create_item(&daemon, "b", "none").await;
    let c = create_item(&daemon, "c", "none").await;
    enqueue(&daemon, &[&a, &b, &c]).await;
    let reordered = ask(&daemon, |reply| RunnerCommand::Reorder {
        project: "demo".into(),
        item_ids: vec![c.id.clone(), a.id.clone()],
        reply,
    })
    .await
    .unwrap();
    let order: Vec<&str> = reordered.entries.iter().map(|e| e.title.as_str()).collect();
    assert_eq!(order, ["c", "a", "b"]);
    let mut events = daemon.subscribe();
    let started = settings(&daemon, running_with(&lead)).await;
    let running = entry(&started, &c).unwrap().clone();
    assert_eq!(running.state, wire::RunnerEntryState::Running);
    let task_id = running.task_id.clone().unwrap();
    wait_for_parent(&mut events, &task_id, "asking", |t| {
        t.workflow_run.as_ref().is_some_and(|w| w.waiting.is_some())
    })
    .await;
    daemon.shutdown().await;

    let daemon = Daemon::spawn(repo.projects.clone(), Store::open_at(&db_path).ok());
    let restored = status(&daemon).await;
    assert!(restored.settings.running);
    assert_eq!(restored.settings.agent, lead);
    assert_eq!(restored.dispatched_today, 1);
    let order: Vec<(&str, wire::RunnerEntryState)> = restored
        .entries
        .iter()
        .map(|e| (e.title.as_str(), e.state))
        .collect();
    assert_eq!(
        order,
        [
            ("a", wire::RunnerEntryState::Queued),
            ("b", wire::RunnerEntryState::Queued),
            ("c", wire::RunnerEntryState::Running),
        ]
    );
    assert_eq!(
        entry(&restored, &c).unwrap().task_id.as_deref(),
        Some(task_id.as_str())
    );

    daemon.send(Command::Runner(RunnerCommand::Tick)).await;
    let ticked = status(&daemon).await;
    assert!(ticked.hold.as_deref().unwrap().contains("1 of 1 run slot"));
    assert_eq!(
        entry(&ticked, &a).unwrap().state,
        wire::RunnerEntryState::Queued
    );
    assert_eq!(item_status(&daemon, &c.id).await, "in_progress");
    let runs = ask(&daemon, |reply| RunnerCommand::Runs {
        project: "demo".into(),
        limit: None,
        reply,
    })
    .await
    .unwrap();
    assert_eq!(runs.len(), 1);
    assert_eq!(runs[0].outcome, wire::ItemRunOutcome::Running);

    // Deleting the pipeline task frees the slot and sends the item back.
    let (tx, rx) = tokio::sync::oneshot::channel();
    daemon
        .send(Command::DeleteTask {
            id: task_id.clone(),
            reply: tx,
        })
        .await;
    rx.await.unwrap().unwrap();
    let freed = wait_status(&daemon, "next item starts", |s| {
        entry(s, &a).is_some_and(|e| e.state == wire::RunnerEntryState::Running)
    })
    .await;
    assert!(entry(&freed, &c).is_none());
    assert_eq!(item_status(&daemon, &c.id).await, "todo");
    daemon.shutdown().await;
}
