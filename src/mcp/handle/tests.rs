use serde_json::{json, Value};

use super::handle_tool_call;
use crate::mcp::daemon_client::fake::FakeDaemon;
use crate::mcp::daemon_client::DaemonClient;

async fn call_single(daemon: &FakeDaemon, project: &str, name: &str, args: Value) -> String {
    let mut client = DaemonClient::new(Box::new(daemon.clone()));
    let params = json!({ "name": name, "arguments": args });
    handle_tool_call(&mut client, "", project, false, Some(&params))
        .await
        .unwrap_or_else(|error| format!("Error: {error:#}"))
}

fn last_params(daemon: &FakeDaemon) -> Value {
    daemon.state().sent.last().expect("a request")["params"].clone()
}

#[tokio::test]
async fn automation_tools_reach_the_daemon_in_single_mode() {
    let daemon = FakeDaemon::at("ws://a");
    for (tool, args, method) in [
        ("automation_list", json!({}), "automation.list"),
        ("automation_get", json!({ "id": "a1" }), "automation.show"),
        (
            "automation_update",
            json!({ "id": "a1", "enabled": false }),
            "automation.update",
        ),
        (
            "automation_delete",
            json!({ "id": "a1" }),
            "automation.delete",
        ),
        (
            "automation_run_now",
            json!({ "id": "a1" }),
            "automation.runNow",
        ),
        ("automation_runs", json!({ "id": "a1" }), "automation.runs"),
    ] {
        let text = call_single(&daemon, "", tool, args).await;
        assert!(!text.starts_with("Error"), "{tool}: {text}");
        assert_eq!(
            daemon.state().sent.last().unwrap()["method"],
            method,
            "{tool}"
        );
    }
}

#[tokio::test]
async fn automation_create_defaults_to_the_current_project() {
    let daemon = FakeDaemon::at("ws://a");
    let args = json!({ "name": "n", "prompt": "p", "agent": "claude",
                       "reuse_session": true, "missed_run_grace_minutes": 5 });
    let text = call_single(&daemon, "demo", "automation_create", args).await;

    assert!(text.starts_with("Automation created"), "{text}");
    let params = last_params(&daemon);
    assert_eq!(params["project"], "demo");
    assert_eq!(params["reuse_session"], true);
    assert_eq!(params["missed_run_grace_minutes"], 5);
}

#[tokio::test]
async fn automation_create_prefers_an_explicit_project() {
    let daemon = FakeDaemon::at("ws://a");
    let args = json!({ "project": "other", "name": "n", "prompt": "p", "agent": "claude" });
    call_single(&daemon, "demo", "automation_create", args).await;

    assert_eq!(last_params(&daemon)["project"], "other");
}

#[tokio::test]
async fn automation_create_without_any_project_is_a_clear_error() {
    let daemon = FakeDaemon::at("ws://a");
    let args = json!({ "name": "n", "prompt": "p", "agent": "claude" });
    let text = call_single(&daemon, "", "automation_create", args).await;

    assert!(text.contains("'project' is required"), "{text}");
    assert!(daemon.state().sent.is_empty());
}

#[tokio::test]
async fn orchestrator_tools_stay_refused_in_single_mode() {
    let text = call_single(&FakeDaemon::at("ws://a"), "demo", "spawn_agent", json!({})).await;
    assert!(
        text.contains("only available in an orchestrator session"),
        "{text}"
    );
}

#[tokio::test]
async fn backlog_task_needs_a_title_or_prompt_at_call_time() {
    let daemon = FakeDaemon::at("ws://a");
    let text = call_single(
        &daemon,
        "demo",
        "create_backlog_task",
        json!({ "title": " " }),
    )
    .await;
    assert!(text.contains("'title' is required"), "{text}");

    let args = json!({ "title": "", "prompt": "legacy" });
    let text = call_single(&daemon, "demo", "create_backlog_task", args).await;
    assert!(text.starts_with("Created backlog item"), "{text}");
    assert_eq!(last_params(&daemon)["title"], "legacy");
}

#[tokio::test]
async fn memory_approval_from_an_agent_never_asks_for_deletion() {
    let daemon = FakeDaemon::at("ws://a");
    call_single(
        &daemon,
        "demo",
        "memory_resolve_compaction",
        json!({ "id": 3, "approve": true }),
    )
    .await;
    let sent = last_params(&daemon);
    assert_eq!(sent["approve"], true);
    assert_eq!(sent["apply"], false);
}

#[tokio::test]
async fn memory_store_records_the_sessions_task() {
    let daemon = FakeDaemon::at("ws://a");
    let mut client = DaemonClient::new(Box::new(daemon.clone()));
    let params = json!({ "name": "memory_store", "arguments": { "content": "a fact" } });
    for (task, expected) in [("t_42", Some("t_42")), ("", None)] {
        handle_tool_call(&mut client, task, "demo", false, Some(&params))
            .await
            .unwrap();
        let sent = last_params(&daemon);
        assert_eq!(sent.get("created_by").and_then(Value::as_str), expected);
    }
}
