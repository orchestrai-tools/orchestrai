//! `spawn_workflow`: a pipeline as the orchestrator's child, or a Factory
//! task with a draft pull request.

use serde_json::{json, Value};

use super::{item, methods, page, script};
use crate::mcp::daemon_client::fake::FakeDaemon;
use crate::mcp::daemon_client::DaemonClient;
use crate::mcp::handle::handle_tool_call;

async fn spawn(daemon: &FakeDaemon, args: Value) -> String {
    let mut client = DaemonClient::new(Box::new(daemon.clone()));
    let params = json!({ "name": "spawn_workflow", "arguments": args });
    handle_tool_call(&mut client, "t_chat", "demo", true, Some(&params))
        .await
        .unwrap_or_else(|error| format!("Error: {error:#}"))
}

fn sent(daemon: &FakeDaemon, method: &str) -> Value {
    let state = daemon.state();
    let frame = state.sent.iter().rev().find(|f| f["method"] == method);
    frame.expect("the request was sent")["params"].clone()
}

fn agents(daemon: &FakeDaemon) {
    let catalog = json!({ "agents": [{ "id": "opencode", "enabled": true, "models": [{
        "id": "model", "name": "Model", "category": "model", "currentValue": "opencode-go/default",
        "options": [{ "value": "opencode-go/default", "name": "Default" },
                    { "value": "opencode-go/gpt-6-luna", "name": "Luna" }] }] }] });
    script(daemon, "agents.list", vec![catalog]);
}

#[tokio::test]
async fn without_a_pull_request_it_is_the_orchestrators_child_as_before() {
    let daemon = FakeDaemon::at("ws://a");
    script(&daemon, "task.create", vec![json!({ "taskId": "t_wf" })]);
    let text = spawn(
        &daemon,
        json!({ "workflow_id": "review-loop", "goal": "Add a cache", "agent": "claude" }),
    )
    .await;

    assert!(
        text.starts_with("Dispatched workflow 'review-loop' as task t_wf"),
        "{text}"
    );
    assert_eq!(methods(&daemon), ["task.create"]);
    let params = sent(&daemon, "task.create");
    assert_eq!(params["prompt"], "Add a cache");
    assert_eq!(params["agent"], "claude");
    assert_eq!(params["parent_task_id"], "t_chat");
    assert_eq!(params["tags"], json!(["orchestrator", "workflow-subagent"]));
    assert_eq!(params["worktree"], false);
    assert!(params.get("factory").is_none());
}

#[tokio::test]
async fn with_a_pull_request_a_backlog_item_goes_through_the_factory() {
    let daemon = FakeDaemon::at("ws://a");
    script(
        &daemon,
        "backlog.list",
        vec![page(vec![item(5, "todo")], false)],
    );
    script(
        &daemon,
        "runner.brief",
        vec![json!({ "prompt": "Backlog item #5: Item 5" })],
    );
    agents(&daemon);
    script(
        &daemon,
        "task.create",
        vec![json!({ "taskId": "t_f", "started": false })],
    );
    let text = spawn(
        &daemon,
        json!({ "workflow_id": "review-loop", "agent": "opencode", "backlog_item": 5,
                "model": "opencode-go/gpt-6-luna", "pull_request": true,
                "run_location": "worktree" }),
    )
    .await;

    assert!(text.contains("Started Factory task t_f"), "{text}");
    assert!(text.contains("waits in the Factory queue"), "{text}");
    assert_eq!(
        methods(&daemon),
        ["backlog.list", "runner.brief", "agents.list", "task.create"]
    );
    let params = sent(&daemon, "task.create");
    assert_eq!(params["prompt"], "Backlog item #5: Item 5");
    assert_eq!(params["agent"], "opencode");
    assert_eq!(params["default_model"], "opencode-go/gpt-6-luna");
    assert_eq!(params["backlog_item_id"], "b_5");
    assert_eq!(params["parent_task_id"], "t_chat");
    assert_eq!(params["workflow"], "review-loop");
    assert_eq!(
        params["factory"],
        json!({ "deliver": true, "runLocation": "worktree" })
    );
}

#[tokio::test]
async fn a_model_of_another_agent_is_refused_before_anything_starts() {
    let daemon = FakeDaemon::at("ws://a");
    agents(&daemon);
    let text = spawn(
        &daemon,
        json!({ "workflow_id": "review-loop", "goal": "g", "agent": "opencode",
                "model": "claude-opus-5", "pull_request": true }),
    )
    .await;

    assert!(
        text.contains("model 'claude-opus-5' is not valid for agent 'opencode'"),
        "{text}"
    );
    assert_eq!(methods(&daemon), ["agents.list"]);
}

#[tokio::test]
async fn automatic_without_a_pull_request_follows_the_template_and_links_the_item() {
    let daemon = FakeDaemon::at("ws://a");
    script(
        &daemon,
        "backlog.list",
        vec![page(vec![item(7, "todo")], false)],
    );
    script(
        &daemon,
        "runner.status",
        vec![json!({ "settings": { "runLocation": "auto" } })],
    );
    script(
        &daemon,
        "workflow.list",
        vec![json!({ "workflows": [{ "id": "plain" },
                                   { "id": "verify-review-loop", "verifyRequired": true }] })],
    );
    script(&daemon, "task.create", vec![json!({ "taskId": "t_wf" })]);
    let text = spawn(
        &daemon,
        json!({ "workflow_id": "plain", "goal": "Tidy up", "agent": "claude",
                "backlog_item": 7, "run_location": "auto" }),
    )
    .await;

    assert!(text.starts_with("Dispatched workflow 'plain'"), "{text}");
    let params = sent(&daemon, "task.create");
    assert_eq!(params["worktree"], true, "a plain template runs in a copy");
    assert_eq!(params["backlog_item_id"], "b_7");
    assert!(params.get("factory").is_none());
    assert_eq!(
        sent(&daemon, "workItem.linkTask"),
        json!({ "item_id": "b_7", "task_id": "t_wf" })
    );
}

#[tokio::test]
async fn a_goal_or_an_item_and_a_known_location_are_required() {
    let daemon = FakeDaemon::at("ws://a");
    let text = spawn(&daemon, json!({ "workflow_id": "w", "agent": "claude" })).await;
    assert!(
        text.contains("'goal' is required unless backlog_item"),
        "{text}"
    );
    let text = spawn(
        &daemon,
        json!({ "workflow_id": "w", "agent": "claude", "goal": "g", "run_location": "cloud" }),
    )
    .await;
    assert!(
        text.contains("run_location must be auto, worktree or checkout"),
        "{text}"
    );
    assert!(methods(&daemon).is_empty());
}
