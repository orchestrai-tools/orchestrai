//! An orchestrator's `spawn_workflow` with a pull request is a Factory task
//! like one from New Task: queued, delivered as a draft, its item linked.

use serde_json::json;

use super::*;

#[tokio::test]
async fn spawn_workflow_with_a_pull_request_delivers_through_the_factory() {
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
    settings(&daemon, running_with(&writing_agent())).await;
    let item = create_item(&daemon, "from the orchestrator", "high").await;

    let created = rpc(
        &daemon,
        "task.create",
        json!({ "project": "demo", "prompt": "Ship the orchestrator's change",
                "agent": writing_agent(), "include_runtime_context": true,
                "parent_task_id": "t_chat", "workflow": "test",
                "backlog_item_id": item.id,
                "factory": { "deliver": true, "runLocation": "default" } }),
    )
    .await;
    let task_id = created["taskId"].as_str().unwrap().to_string();
    let task = find_task(&daemon, &task_id).await.unwrap();
    assert!(task.tags.iter().any(|t| t == "runner"));
    assert_eq!(task.backlog_item_id.as_deref(), Some(item.id.as_str()));
    assert_eq!(task.title, "from the orchestrator");

    let run = wait_run(&mut events, "delivered", |run| {
        run.task_id.as_deref() == Some(task_id.as_str())
            && run.outcome == wire::ItemRunOutcome::Delivered
    })
    .await;
    assert_eq!(run.item_id, item.id);
    assert_eq!(opened.lock().unwrap().len(), 1);
    assert_eq!(item_status(&daemon, &item.id).await, "waiting");

    let again = crate::daemon::server::dispatch_detached(
        &daemon,
        serde_json::from_value(json!({ "method": "task.create", "params": {
            "project": "demo", "prompt": "again", "agent": writing_agent(),
            "workflow": "test", "backlog_item_id": item.id,
            "factory": { "deliver": true } } }))
        .unwrap(),
    )
    .await;
    assert!(
        again.is_err_and(|e| e.message.contains("already has a Factory task")),
        "one Factory task per backlog item"
    );
    daemon.shutdown().await;
}
