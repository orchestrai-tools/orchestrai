use super::*;

/// Factory tasks exist, queued, as soon as they are asked for, start in
/// priority order, and each limit holds them with a structured reason until
/// it clears: disk floor, quota, headroom, slots and the daily cap.
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
    settings(
        &daemon,
        wire::RunnerSettingsPatch {
            min_free_gb: Some(10_000),
            ..running_with(&lead)
        },
    )
    .await;

    let queued = enqueue(&daemon, &[&low, &high, &high_later]).await;
    assert_eq!(queued.created.len(), 3);
    assert!(queued.created.iter().all(|c| !c.started));
    let order: Vec<&str> = queued
        .status
        .entries
        .iter()
        .map(|e| e.title.as_str())
        .collect();
    assert_eq!(order, ["high", "high later", "low"]);
    assert!(matches!(
        queued.status.hold,
        Some(wire::RunnerWait::Disk { min_gb: 10_000, .. })
    ));
    let waiting = find_task(&daemon, &queued.created[1].task_id)
        .await
        .expect("the queued task exists");
    assert_eq!(waiting.status, TaskStatus::Queued);
    assert!(waiting.tags.iter().any(|t| t == "runner"));
    assert_eq!(waiting.title, "high");

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
    assert!(
        matches!(
            exhausted.entries[0].wait,
            Some(wire::RunnerWait::Quota {
                used_pct: Some(100),
                ..
            })
        ),
        "{:?}",
        exhausted.entries[0].wait
    );

    let mut hot = crate::daemon::limits::gate::exhausted_row(&lead);
    hot.exhausted = false;
    hot.windows[0].used_percent = 90.0;
    daemon
        .send(Command::AgentLimitsUpdated {
            accounts: vec![hot],
        })
        .await;
    let short = settings(&daemon, wire::RunnerSettingsPatch::default()).await;
    assert!(
        matches!(
            short.entries[0].wait,
            Some(wire::RunnerWait::Quota {
                used_pct: Some(90),
                limit_pct: Some(80),
                ..
            })
        ),
        "{:?}",
        short.entries[0].wait
    );

    daemon
        .send(Command::AgentLimitsUpdated {
            accounts: Vec::new(),
        })
        .await;
    let started = settings(&daemon, wire::RunnerSettingsPatch::default()).await;
    let first = entry(&started, &high).unwrap();
    assert_eq!(first.state, wire::RunnerEntryState::Running);
    assert_eq!(
        first.task_id, queued.created[1].task_id,
        "the same task starts"
    );
    assert!(first.wait.is_none());
    assert_eq!(
        started.hold,
        Some(wire::RunnerWait::Slots {
            in_use: 1,
            limit: 1
        })
    );
    assert_eq!(started.dispatched_today, 1);
    assert_eq!(item_status(&daemon, &high.id).await, "in_progress");
    let task = find_task(&daemon, &first.task_id).await.unwrap();
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
    assert!(matches!(
        capped.hold,
        Some(wire::RunnerWait::Daily {
            started: 1,
            limit: 1,
            next_at: Some(_)
        })
    ));
    assert_eq!(
        entry(&capped, &high_later).unwrap().state,
        wire::RunnerEntryState::Queued
    );

    let refused = ask(&daemon, |reply| RunnerCommand::Dequeue {
        project: "demo".into(),
        task_id: first.task_id.clone(),
        reply,
    })
    .await;
    assert!(refused.unwrap_err().contains("already started"));
    let low_task = entry(&capped, &low).unwrap().task_id.clone();
    let dequeued = ask(&daemon, |reply| RunnerCommand::Dequeue {
        project: "demo".into(),
        task_id: low_task.clone(),
        reply,
    })
    .await
    .unwrap();
    assert!(entry(&dequeued, &low).is_none());
    timeout(Duration::from_secs(10), async {
        while find_task(&daemon, &low_task).await.is_some() {
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    })
    .await
    .expect("a removed queued task is deleted");
    daemon.shutdown().await;
}

/// A Factory run cannot start Factory tasks, and a request says item by item
/// what it skipped and why.
#[tokio::test]
async fn enqueue_reports_what_it_skipped() {
    let repo = factory_repo("name: Refuse flow\n").await;
    let lead = wf_agent(&repo.dir, "lead.state", "question");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let first = create_item(&daemon, "first", "none").await;
    let second = create_item(&daemon, "second", "none").await;
    settings(&daemon, running_with(&lead)).await;
    let started = enqueue(&daemon, &[&first]).await;
    assert!(started.created[0].started);
    let task_id = started.created[0].task_id.clone();

    let from_run = ask(&daemon, |reply| RunnerCommand::Enqueue {
        project: "demo".into(),
        item_ids: vec![second.id.clone()],
        config: wire::FactoryConfig::default(),
        origin_task: Some(task_id.clone()),
        reply,
    })
    .await;
    assert!(from_run.unwrap_err().contains("cannot start Factory tasks"));

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
    let result = enqueue(&daemon, &[&first, &second]).await;
    assert!(result.created.is_empty());
    let reasons: Vec<&wire::SkipReason> = result.skipped.iter().map(|s| &s.reason).collect();
    assert_eq!(
        reasons,
        [
            &wire::SkipReason::AlreadyInFactory {
                task_id: Some(task_id)
            },
            &wire::SkipReason::Closed {
                status: "done".into()
            },
        ]
    );
    assert_eq!(result.skipped[1].number, second.number);
    daemon.shutdown().await;
}

/// A queued task can be moved ahead and started now past the slot limit; a
/// task from the New Task dialog needs no backlog item.
#[tokio::test]
async fn start_now_passes_the_slot_limit_and_a_dialog_task_needs_no_item() {
    let repo = factory_repo("name: Order flow\n").await;
    let lead = wf_agent(&repo.dir, "lead.state", "question");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let a = create_item(&daemon, "a", "none").await;
    let b = create_item(&daemon, "b", "none").await;
    let c = create_item(&daemon, "c", "none").await;
    settings(&daemon, running_with(&lead)).await;
    let result = enqueue(&daemon, &[&a, &b, &c]).await;
    let started: Vec<bool> = result.created.iter().map(|c| c.started).collect();
    assert_eq!(started, [true, false, false]);

    let reordered = ask(&daemon, |reply| RunnerCommand::Reorder {
        project: "demo".into(),
        task_ids: vec![entry(&result.status, &c).unwrap().task_id.clone()],
        reply,
    })
    .await
    .unwrap();
    let queued: Vec<&str> = reordered
        .entries
        .iter()
        .filter(|e| e.state == wire::RunnerEntryState::Queued)
        .map(|e| e.title.as_str())
        .collect();
    assert_eq!(queued, ["c", "b"]);

    let b_task = entry(&reordered, &b).unwrap().task_id.clone();
    let now = ask(&daemon, |reply| RunnerCommand::StartNow {
        project: "demo".into(),
        task_id: b_task,
        reply,
    })
    .await
    .unwrap();
    assert_eq!(
        entry(&now, &b).unwrap().state,
        wire::RunnerEntryState::Running
    );
    assert_eq!(
        now.hold,
        Some(wire::RunnerWait::Slots {
            in_use: 2,
            limit: 1
        })
    );

    let (tx, rx) = tokio::sync::oneshot::channel();
    let new = crate::daemon::actor::runner::NewFactoryTask {
        project: "demo".into(),
        prompt: "Add a dark mode toggle\n\nIn settings.".into(),
        deliver: true,
        ..Default::default()
    };
    daemon
        .send(Command::Runner(RunnerCommand::CreateTask {
            task: Box::new(new),
            reply: tx,
        }))
        .await;
    let created = rx.await.unwrap().unwrap();
    assert!(!created.started, "every slot is taken");
    assert!(created.item_id.is_none());
    let task = find_task(&daemon, &created.task_id).await.unwrap();
    assert_eq!(task.title, "Add a dark mode toggle");
    assert!(task.prompt.starts_with("[Factory run"));
    assert!(task.backlog_item_id.is_none());
    daemon.shutdown().await;
}
