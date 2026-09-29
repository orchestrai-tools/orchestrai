use super::*;

/// Queued items start in priority order, and each gate holds the queue with
/// a reason until it clears: pause, disk floor, quota, headroom, slots and
/// the daily cap.
#[tokio::test]
async fn dispatch_follows_priority_and_holds_on_every_gate() {
    let workflow = "name: Gate flow\n";
    let repo = factory_repo(workflow).await;
    // The implement stage asks a question, so a started pipeline holds its slot.
    let lead = wf_agent(&repo.dir, "lead.state", "question");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let low = create_item(&daemon, "low", "low").await;
    let high = create_item(&daemon, "high", "high").await;
    let high_later = create_item(&daemon, "high later", "high").await;

    let queued = enqueue(&daemon, &[&low, &high, &high_later]).await;
    let order: Vec<&str> = queued.entries.iter().map(|e| e.title.as_str()).collect();
    assert_eq!(order, ["high", "high later", "low"]);
    assert!(queued.hold.as_deref().unwrap().contains("paused"));

    let paused = settings(
        &daemon,
        wire::RunnerSettingsPatch {
            workflow: Some("test".into()),
            agent: Some(lead.clone()),
            ..Default::default()
        },
    )
    .await;
    assert!(paused.hold.as_deref().unwrap().contains("paused"));

    let full_disk = settings(
        &daemon,
        wire::RunnerSettingsPatch {
            running: Some(true),
            min_free_gb: Some(10_000),
            ..Default::default()
        },
    )
    .await;
    assert!(full_disk.hold.as_deref().unwrap().contains("GB free"));

    daemon
        .send(Command::AgentLimitsUpdated {
            accounts: vec![crate::daemon::limits::gate::exhausted_row(&lead)],
        })
        .await;
    let exhausted = settings(
        &daemon,
        wire::RunnerSettingsPatch {
            min_free_gb: Some(0),
            ..Default::default()
        },
    )
    .await;
    assert!(exhausted.hold.is_none());
    assert!(exhausted
        .entries
        .iter()
        .all(|e| e.state == wire::RunnerEntryState::Queued));
    let reason = exhausted.entries[0].waiting_reason.clone().unwrap();
    assert!(reason.contains("out of quota"), "{reason}");

    let mut hot = crate::daemon::limits::gate::exhausted_row(&lead);
    hot.exhausted = false;
    hot.windows[0].used_percent = 90.0;
    daemon
        .send(Command::AgentLimitsUpdated {
            accounts: vec![hot],
        })
        .await;
    let short = settings(&daemon, wire::RunnerSettingsPatch::default()).await;
    let reason = short.entries[0].waiting_reason.clone().unwrap();
    assert!(reason.contains("headroom 80%"), "{reason}");

    daemon
        .send(Command::AgentLimitsUpdated {
            accounts: Vec::new(),
        })
        .await;
    let started = settings(&daemon, wire::RunnerSettingsPatch::default()).await;
    let first = entry(&started, &high).unwrap();
    assert_eq!(first.state, wire::RunnerEntryState::Running);
    let task_id = first.task_id.clone().unwrap();
    assert!(first.waiting_reason.is_none());
    assert!(started.hold.as_deref().unwrap().contains("1 of 1 run slot"));
    assert_eq!(started.dispatched_today, 1);
    assert_eq!(item_status(&daemon, &high.id).await, "in_progress");
    let task = daemon
        .tasks()
        .await
        .into_iter()
        .find(|t| t.id == task_id)
        .unwrap();
    assert!(task.tags.iter().any(|t| t == "runner"));
    assert_eq!(task.backlog_item_id.as_deref(), Some(high.id.as_str()));
    assert!(task.prompt.contains("Backlog item #2: high"));
    assert!(task.prompt.contains("Do not commit"));

    let capped = settings(
        &daemon,
        wire::RunnerSettingsPatch {
            max_concurrent: Some(2),
            max_per_day: Some(1),
            ..Default::default()
        },
    )
    .await;
    assert!(capped.hold.as_deref().unwrap().contains("last 24 hours"));
    assert_eq!(
        entry(&capped, &high_later).unwrap().state,
        wire::RunnerEntryState::Queued
    );

    let refused = ask(&daemon, |reply| RunnerCommand::Dequeue {
        project: "demo".into(),
        item_id: high.id.clone(),
        reply,
    })
    .await;
    assert!(refused.unwrap_err().contains("already started"));
    let dequeued = ask(&daemon, |reply| RunnerCommand::Dequeue {
        project: "demo".into(),
        item_id: low.id.clone(),
        reply,
    })
    .await
    .unwrap();
    assert!(entry(&dequeued, &low).is_none());
    daemon.shutdown().await;
}

/// A Factory run cannot fill its own queue, and a finished item is refused.
#[tokio::test]
async fn a_runner_task_cannot_queue_and_done_items_are_refused() {
    let repo = factory_repo("name: Refuse flow\n").await;
    let lead = wf_agent(&repo.dir, "lead.state", "question");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let first = create_item(&daemon, "first", "none").await;
    let second = create_item(&daemon, "second", "none").await;
    enqueue(&daemon, &[&first]).await;
    let running = settings(&daemon, running_with(&lead)).await;
    let task_id = entry(&running, &first).unwrap().task_id.clone().unwrap();

    let from_run = ask(&daemon, |reply| RunnerCommand::Enqueue {
        project: "demo".into(),
        item_ids: vec![second.id.clone()],
        workflow: None,
        agent: None,
        model: None,
        run_location: Default::default(),
        origin_task: Some(task_id),
        reply,
    })
    .await;
    assert!(from_run.unwrap_err().contains("cannot queue"));

    let (tx, rx) = tokio::sync::oneshot::channel();
    daemon
        .send(Command::BacklogUpdate {
            patch: crate::daemon::backlog::ItemPatch {
                item_id: second.id.clone(),
                project: "demo".into(),
                status: Some("done".into()),
                ..Default::default()
            },
            reply: tx,
        })
        .await;
    rx.await.unwrap().unwrap();
    let done = ask(&daemon, |reply| RunnerCommand::Enqueue {
        project: "demo".into(),
        item_ids: vec![second.id.clone()],
        workflow: None,
        agent: None,
        model: None,
        run_location: Default::default(),
        origin_task: None,
        reply,
    })
    .await;
    assert!(done.unwrap_err().contains("already done"));
    daemon.shutdown().await;
}
