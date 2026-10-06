//! Run again: a failed or stopped Factory task starts a new task for the
//! same backlog item with the same configuration, never on its own.

use super::*;

#[tokio::test]
async fn run_again_starts_a_new_task_with_the_same_configuration() {
    let repo = factory_repo("name: placeholder\n").await;
    let reviewer = wf_agent(&repo.dir, "rev.state", "garbage");
    let workflow = format!("name: Broken flow\nreview:\n  reviewers:\n    - agent: {reviewer}\n");
    std::fs::write(repo.work.join(".orchestrai/workflows/test.yaml"), workflow).unwrap();
    let lead = wf_agent(&repo.dir, "lead.state", "impl");
    let daemon = Daemon::spawn(
        repo.projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let mut events = daemon.subscribe();
    let item = create_item(&daemon, "flaky", "none").await;
    settings(&daemon, running_with(&lead)).await;
    let config = wire::FactoryConfig {
        run_location: wire::EntryRunLocation::Worktree,
        ..wire::FactoryConfig::default()
    };
    let first = enqueue_with(&daemon, &[&item], config).await;
    let old_task = first.created[0].task_id.clone();
    wait_run(&mut events, "first attempt failed", |run| {
        run.task_id.as_deref() == Some(old_task.as_str())
            && run.outcome == wire::ItemRunOutcome::Failed
    })
    .await;
    wait_status(&daemon, "the entry ends", |s| s.entries.is_empty()).await;
    // Keep the new task queued, so the second Run again finds it.
    settings(
        &daemon,
        wire::RunnerSettingsPatch {
            min_free_gb: Some(10_000),
            ..Default::default()
        },
    )
    .await;

    let again = ask(&daemon, |reply| RunnerCommand::Retry {
        task_id: old_task.clone(),
        reply,
    })
    .await
    .unwrap();
    assert!(again.skipped.is_empty());
    let new_task = again.created[0].task_id.clone();
    assert_ne!(new_task, old_task);
    assert!(!again.created[0].started);
    assert_eq!(again.created[0].item_id.as_deref(), Some(item.id.as_str()));
    let fresh = entry(&again.status, &item).expect("a new entry");
    assert_eq!(fresh.task_id, new_task);
    assert_eq!(fresh.workflow.as_deref(), Some("test"));
    assert_eq!(fresh.agent.as_deref(), Some(lead.as_str()));
    assert_eq!(fresh.run_location, wire::EntryRunLocation::Worktree);
    assert!(fresh.deliver);
    let task = find_task(&daemon, &new_task).await.unwrap();
    assert_eq!(
        task.prompt.matches("[Factory run").count(),
        1,
        "the preamble is not doubled: {}",
        task.prompt
    );

    let twice = ask(&daemon, |reply| RunnerCommand::Retry {
        task_id: old_task.clone(),
        reply,
    })
    .await
    .unwrap();
    assert!(twice.created.is_empty());
    assert!(matches!(
        twice.skipped[0].reason,
        wire::SkipReason::AlreadyInFactory { .. }
    ));
    daemon.shutdown().await;
}
