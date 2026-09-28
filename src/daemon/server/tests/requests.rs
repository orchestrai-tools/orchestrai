//! Request dispatch guards and scoping.

use super::*;
use crate::daemon::{Daemon, Store};
use crate::registry::ProjectEntry;
use std::time::Duration;
use tokio::time::timeout;

/// An unparseable port range on `project.add` is rejected at the parse
/// gate — before the project is registered, so there is no half-created
/// entry and the caller can retry with a fixed range.
#[tokio::test]
async fn an_unparseable_range_rejects_the_add_before_registration() {
    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let handle = Daemon::spawn(Vec::new(), store);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(run(listener, handle.clone(), String::new()));
    let (mut ws, _) = tokio_tungstenite::connect_async(&format!("ws://{addr}"))
        .await
        .unwrap();

    // The path exists, so the only thing that can fail is the range —
    // an error naming the range proves parsing precedes registration.
    let dir = tempfile::tempdir().unwrap();
    ws.send(Message::Text(
        json!({
            "id": 9,
            "method": "project.add",
            "params": { "path": dir.path().to_string_lossy(), "port_range": "nonsense" }
        })
        .to_string(),
    ))
    .await
    .unwrap();

    let msg = timeout(Duration::from_secs(2), ws.next())
        .await
        .expect("a reply, not silence")
        .expect("some")
        .expect("ok");
    let Message::Text(t) = msg else {
        panic!("expected a text frame")
    };
    let v: serde_json::Value = serde_json::from_str(t.as_str()).unwrap();
    assert_eq!(v["error"]["code"], "invalid_request");
    assert!(
        v["error"]["message"]
            .as_str()
            .is_some_and(|m| m.contains("invalid port range")),
        "the range must be rejected by name, not by a registry error: {}",
        v["error"]["message"]
    );
}

#[tokio::test]
async fn orchestrator_list_agents_scopes_parent_and_project() {
    let projects = vec![
        ProjectEntry {
            name: "demo".into(),
            path: ".".into(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        },
        ProjectEntry {
            name: "other".into(),
            path: ".".into(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        },
    ];
    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let handle = Daemon::spawn(projects, store);
    let parent = handle
        .create_task(
            "demo",
            "orchestrator",
            "codex",
            vec!["orchestrator-chat".into()],
            false,
            false,
            None,
            Vec::new(),
            None,
            Default::default(),
            None,
        )
        .await;
    let demo_child = handle
        .create_task(
            "demo",
            "demo child",
            "codex",
            Vec::new(),
            false,
            false,
            Some(parent.clone()),
            Vec::new(),
            None,
            Default::default(),
            None,
        )
        .await;
    let _other_project_child = handle
        .create_task(
            "other",
            "other child",
            "codex",
            Vec::new(),
            false,
            false,
            Some(parent.clone()),
            Vec::new(),
            None,
            Default::default(),
            None,
        )
        .await;
    let unrelated = handle
        .create_task(
            "demo",
            "unrelated child",
            "codex",
            Vec::new(),
            false,
            false,
            Some("t_other_parent".into()),
            Vec::new(),
            None,
            Default::default(),
            None,
        )
        .await;

    let lifecycle = Arc::new(ServerLifecycle::new(wire::DaemonOwner::External));
    let result = dispatch(
        &handle,
        wire::Method::OrchestratorListAgents {
            parent_task_id: parent,
            project: Some("demo".into()),
        },
        &lifecycle,
    )
    .await
    .unwrap();
    let agents = result["agents"].as_array().unwrap();
    assert_eq!(agents.len(), 1);
    assert_eq!(agents[0]["id"], demo_child);
    assert_ne!(agents[0]["id"], unrelated);
    handle.shutdown().await;
}

/// spawn_agent's `task.create` is refused while the agent's account is out of
/// quota: the orchestrator gets the reason, and no task is created.
#[tokio::test]
async fn subagent_create_on_an_exhausted_account_is_refused() {
    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let handle = Daemon::spawn(Vec::new(), store);
    handle
        .send(crate::daemon::Command::AgentLimitsUpdated {
            accounts: vec![crate::daemon::limits::gate::exhausted_row("mock-agent")],
        })
        .await;

    let lifecycle = Arc::new(ServerLifecycle::new(wire::DaemonOwner::External));
    let method: wire::Method = serde_json::from_value(json!({
        "method": "task.create",
        "params": {
            "project": "demo",
            "prompt": "fix it",
            "agent": "mock-agent",
            "tags": ["orchestrator", "subagent"],
            "parent_task_id": "t_orchestrator",
        }
    }))
    .unwrap();
    let error = dispatch(&handle, method, &lifecycle)
        .await
        .expect_err("an exhausted sub-agent is refused");
    assert_eq!(error.code, wire::ErrorCode::AgentUnavailable);
    assert!(error.message.contains("out of quota"), "{}", error.message);
    assert!(handle.tasks().await.is_empty(), "no task is created");
    handle.shutdown().await;
}

/// A worktree base that cannot be used is refused before the task exists, so
/// New Task keeps the prompt and shows why.
#[tokio::test]
async fn a_checked_out_branch_is_refused_before_the_task_is_created() {
    let dir = tempfile::tempdir().unwrap();
    crate::daemon::diff::testsupport::init_repo(dir.path()).await;
    crate::daemon::diff::testsupport::git(dir.path(), &["checkout", "-q", "-b", "main"]).await;
    crate::daemon::diff::testsupport::git(
        dir.path(),
        &["commit", "-q", "--allow-empty", "-m", "i"],
    )
    .await;
    let projects = vec![ProjectEntry {
        name: "demo".into(),
        path: dir.path().to_string_lossy().into(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }];
    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let handle = Daemon::spawn(projects, store);
    let lifecycle = Arc::new(ServerLifecycle::new(wire::DaemonOwner::External));
    let method: wire::Method = serde_json::from_value(json!({
        "method": "task.create",
        "params": {
            "project": "demo",
            "prompt": "fix it",
            "agent": "mock-agent",
            "worktree": true,
            "worktree_base": { "kind": "existing", "branch": "main" },
            "start": false,
        }
    }))
    .unwrap();
    let error = dispatch(&handle, method, &lifecycle)
        .await
        .expect_err("the project checkout's branch is refused");
    assert_eq!(error.code, wire::ErrorCode::InvalidRequest);
    assert!(
        error
            .message
            .contains("already checked out in the project checkout"),
        "{}",
        error.message
    );
    assert!(handle.tasks().await.is_empty(), "no task is created");
    handle.shutdown().await;
}
