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
    settings(
        &daemon,
        wire::RunnerSettingsPatch {
            min_free_gb: Some(10_000),
            ..running_with(&lead)
        },
    )
    .await;
    let queued = enqueue(&daemon, &[&a, &b, &c]).await.status;
    let task_of = |item: &wire::BacklogItem| entry(&queued, item).unwrap().task_id.clone();
    let reordered = ask(&daemon, |reply| RunnerCommand::Reorder {
        project: "demo".into(),
        task_ids: vec![task_of(&c), task_of(&a)],
        reply,
    })
    .await
    .unwrap();
    let order: Vec<&str> = reordered.entries.iter().map(|e| e.title.as_str()).collect();
    assert_eq!(order, ["c", "a", "b"]);
    let mut events = daemon.subscribe();
    let started = settings(
        &daemon,
        wire::RunnerSettingsPatch {
            min_free_gb: Some(0),
            ..Default::default()
        },
    )
    .await;
    let running = entry(&started, &c).unwrap().clone();
    assert_eq!(running.state, wire::RunnerEntryState::Running);
    let task_id = running.task_id.clone();
    wait_for_parent(&mut events, &task_id, "asking", |t| {
        t.workflow_run.as_ref().is_some_and(|w| w.waiting.is_some())
    })
    .await;
    daemon.shutdown().await;

    let daemon = Daemon::spawn(repo.projects.clone(), Store::open_at(&db_path).ok());
    let restored = status(&daemon).await;
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
    assert_eq!(entry(&restored, &c).unwrap().task_id, task_id);

    daemon.send(Command::Runner(RunnerCommand::Tick)).await;
    let ticked = status(&daemon).await;
    assert_eq!(
        ticked.hold,
        Some(wire::RunnerWait::Slots {
            in_use: 1,
            limit: 1
        })
    );
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

/// A queue saved before Factory tasks existed, keyed by backlog item and with
/// no task, gets its tasks at boot and keeps its place.
#[tokio::test]
async fn a_queue_saved_before_factory_tasks_gets_its_tasks_at_boot() {
    let repo = factory_repo("name: Legacy flow\n").await;
    let db_path = repo.dir.path().join("warpforge.db");
    let daemon = Daemon::spawn(repo.projects.clone(), Store::open_at(&db_path).ok());
    let item = create_item(&daemon, "old", "none").await;
    settings(
        &daemon,
        wire::RunnerSettingsPatch {
            min_free_gb: Some(10_000),
            workflow: Some("test".into()),
            agent: Some("claude".into()),
            ..Default::default()
        },
    )
    .await;
    daemon.shutdown().await;
    {
        let store = Store::open_at(&db_path).unwrap();
        let legacy = serde_json::json!({
            "itemId": item.id, "project": "demo", "number": item.number, "title": "old",
            "position": 0, "enqueuedAt": 1, "state": "queued", "updatedAt": 1
        });
        let legacy: wire::RunnerEntry = serde_json::from_value(legacy).unwrap();
        store.upsert_runner_entry(&legacy).unwrap();
    }

    let daemon = Daemon::spawn(repo.projects.clone(), Store::open_at(&db_path).ok());
    let restored = status(&daemon).await;
    let adopted = entry(&restored, &item).expect("the old entry is kept");
    assert_eq!(adopted.state, wire::RunnerEntryState::Queued);
    let task = find_task(&daemon, &adopted.task_id)
        .await
        .expect("it has a task now");
    assert_eq!(task.status, TaskStatus::Queued);
    assert_eq!(task.backlog_item_id.as_deref(), Some(item.id.as_str()));
    daemon.shutdown().await;

    let store = Store::open_at(&db_path).unwrap();
    let keys: Vec<String> = store
        .load_runner_queue()
        .unwrap()
        .into_iter()
        .map(|(key, _)| key)
        .collect();
    assert_eq!(keys, std::slice::from_ref(&adopted.task_id));
}
