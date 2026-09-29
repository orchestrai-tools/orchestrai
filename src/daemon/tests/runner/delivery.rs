use super::*;

fn settled(task_id: &str, state: wire::TaskPullState, number: u64) -> Event {
    Event::TaskPullRequest {
        task_id: task_id.to_string(),
        pull_request: Some(wire::TaskPullRequest {
            number,
            title: "t".into(),
            url: format!("https://github.com/o/r/pull/{number}"),
            state,
            checks: None,
            head_oid: None,
            author: None,
            failed_checks: Vec::new(),
            open_comments: Vec::new(),
        }),
    }
}

/// A successful pipeline is committed on its task branch, pushed and opened
/// as a draft; the open pull request holds the next item back; merging marks
/// the item done, and a pull request closed unmerged sends its item back.
#[tokio::test]
async fn a_successful_run_opens_a_draft_pr_and_its_outcome_closes_the_item() {
    let repo = factory_repo("name: placeholder\n").await;
    let reviewer = wf_agent(&repo.dir, "rev.state", "approve");
    let workflow = format!("name: Factory flow\nreview:\n  reviewers:\n    - agent: {reviewer}\n");
    std::fs::write(repo.work.join(".warpforge/workflows/test.yaml"), workflow).unwrap();
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let mut events = daemon.subscribe();
    let opened = fake_opener(&daemon).await;
    let first = create_item(&daemon, "first change", "high").await;
    let second = create_item(&daemon, "second change", "low").await;
    enqueue(&daemon, &[&first, &second]).await;
    settings(
        &daemon,
        wire::RunnerSettingsPatch {
            max_open_prs: Some(1),
            ..running_with(&writing_agent())
        },
    )
    .await;

    let delivered = wait_run(&mut events, "first delivered", |run| {
        run.item_id == first.id && run.outcome == wire::ItemRunOutcome::Delivered
    })
    .await;
    assert_eq!(delivered.pr_number, Some(7));
    assert_eq!(delivered.rounds, 1);
    assert_eq!(
        delivered.cost_usd,
        Some(0.5),
        "the implement session reported $0.50"
    );
    assert!(delivered.finished_at.is_some() && delivered.pr_opened_at.is_some());
    let task_id = delivered.task_id.clone().unwrap();
    {
        let opened = opened.lock().unwrap();
        let (title, body, base) = &opened[0];
        assert_eq!(title, "first change");
        assert!(body.starts_with("Backlog item #1"), "{body}");
        assert!(body.contains("IMPL-DONE"), "{body}");
        assert_eq!(base.as_deref(), Some("main"));
    }
    assert!(origin_branches(&repo.origin).contains(&format!("warpforge/task/{task_id}")));
    let held = wait_status(&daemon, "open pull request holds the queue", |s| {
        s.hold
            .as_deref()
            .is_some_and(|h| h.contains("wait for review"))
    })
    .await;
    assert_eq!(
        entry(&held, &first).unwrap().state,
        wire::RunnerEntryState::Delivered
    );
    assert_eq!(
        entry(&held, &second).unwrap().state,
        wire::RunnerEntryState::Queued
    );
    assert_eq!(item_status(&daemon, &first.id).await, "waiting");

    daemon
        .event_tx
        .send(settled(&task_id, wire::TaskPullState::Merged, 7))
        .ok()
        .expect("the bridge listens");
    let merged = wait_run(&mut events, "first merged", |run| {
        run.id == delivered.id && run.outcome == wire::ItemRunOutcome::Merged
    })
    .await;
    assert!(merged.merged_at.is_some());
    assert_eq!(item_status(&daemon, &first.id).await, "done");

    let second_run = wait_run(&mut events, "second delivered", |run| {
        run.item_id == second.id && run.outcome == wire::ItemRunOutcome::Delivered
    })
    .await;
    let second_task = second_run.task_id.clone().unwrap();
    daemon
        .event_tx
        .send(settled(&second_task, wire::TaskPullState::Closed, 8))
        .ok()
        .expect("the bridge listens");
    let rejected = wait_run(&mut events, "second rejected", |run| {
        run.id == second_run.id && run.outcome == wire::ItemRunOutcome::Rejected
    })
    .await;
    assert!(rejected.closed_at.is_some());
    assert_eq!(item_status(&daemon, &second.id).await, "todo");
    let empty = status(&daemon).await;
    assert!(empty.entries.is_empty(), "{:?}", empty.entries);
    daemon.shutdown().await;
}

/// A failed pipeline and one that changed nothing both end without a pull
/// request, send the item back to `todo`, record the attempt, and never retry.
#[tokio::test]
async fn failed_and_empty_runs_send_the_item_back_without_a_retry() {
    let repo = factory_repo("name: placeholder\n").await;
    // The first review approves an empty change; every later one is prose
    // with no verdict, which fails the second pipeline.
    let reviewer = wf_agent(&repo.dir, "rev.state", "approve garbage");
    let workflow = format!("name: Empty flow\nreview:\n  reviewers:\n    - agent: {reviewer}\n");
    std::fs::write(repo.work.join(".warpforge/workflows/test.yaml"), workflow).unwrap();
    let lead = wf_agent(&repo.dir, "lead.state", "impl");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let mut events = daemon.subscribe();
    let opened = fake_opener(&daemon).await;
    let empty = create_item(&daemon, "nothing to do", "high").await;
    let broken = create_item(&daemon, "no verdict", "low").await;
    enqueue(&daemon, &[&empty, &broken]).await;
    settings(&daemon, running_with(&lead)).await;

    let no_changes = wait_run(&mut events, "no changes", |run| {
        run.item_id == empty.id && run.outcome == wire::ItemRunOutcome::NoChanges
    })
    .await;
    assert!(no_changes.pr_url.is_none());
    let failed = wait_run(&mut events, "failed", |run| {
        run.item_id == broken.id && run.outcome == wire::ItemRunOutcome::Failed
    })
    .await;
    assert!(failed.detail.unwrap().contains("the pipeline failed"));
    assert!(failed.finished_at.is_some());
    assert!(opened.lock().unwrap().is_empty());
    assert_eq!(item_status(&daemon, &empty.id).await, "todo");
    assert_eq!(item_status(&daemon, &broken.id).await, "todo");

    daemon.send(Command::Runner(RunnerCommand::Tick)).await;
    let after = status(&daemon).await;
    assert!(
        after.entries.is_empty(),
        "nothing is retried: {:?}",
        after.entries
    );
    assert_eq!(after.dispatched_today, 2);
    let runs = ask(&daemon, |reply| RunnerCommand::Runs {
        project: "demo".into(),
        limit: None,
        reply,
    })
    .await
    .unwrap();
    assert_eq!(runs.len(), 2);
    assert!(runs.iter().all(|run| run.outcome.is_final()));
    daemon.shutdown().await;
}
