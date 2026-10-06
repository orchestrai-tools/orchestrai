//! Quit: what it would stop, who may shut the daemon down, and that a quit
//! actually ends the server.

use super::*;
use crate::daemon::Daemon;
use crate::registry::ProjectEntry;
use std::time::Duration;
use tokio::time::timeout;

type Ws =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn rpc(ws: &mut Ws, id: u64, method: &str, params: serde_json::Value) -> serde_json::Value {
    ws.send(Message::Text(
        json!({ "id": id, "method": method, "params": params }).to_string(),
    ))
    .await
    .unwrap();
    let Message::Text(frame) = timeout(Duration::from_secs(2), ws.next())
        .await
        .unwrap()
        .unwrap()
        .unwrap()
    else {
        panic!("expected text response");
    };
    serde_json::from_str(frame.as_str()).unwrap()
}

async fn connect(addr: std::net::SocketAddr) -> Ws {
    let (ws, _) = tokio_tungstenite::connect_async(format!("ws://{addr}"))
        .await
        .unwrap();
    ws
}

#[tokio::test]
async fn quit_check_reports_desktop_ownership_and_no_work() {
    let handle = Daemon::spawn(Vec::new(), None);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let lifecycle = Arc::new(ServerLifecycle::new(wire::DaemonOwner::Desktop));
    tokio::spawn(run_controlled(listener, handle, String::new(), lifecycle));

    let response = rpc(&mut connect(addr).await, 1, "app.quitCheck", json!({})).await;
    assert_eq!(response["result"]["owned"], true);
    assert!(response["result"]["blockers"]
        .as_array()
        .unwrap()
        .is_empty());
}

#[tokio::test]
async fn quit_check_reports_an_external_daemon() {
    let handle = Daemon::spawn(Vec::new(), None);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(run(listener, handle, String::new()));

    let response = rpc(&mut connect(addr).await, 1, "app.quitCheck", json!({})).await;
    assert_eq!(response["result"]["owned"], false);
}

#[tokio::test]
async fn quit_check_counts_active_tasks() {
    let projects = vec![ProjectEntry {
        name: "demo".into(),
        path: ".".into(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }];
    let handle = Daemon::spawn(projects, None);
    let task_id = handle
        .create_task(
            "demo",
            "keep working",
            "sleep 60",
            Vec::new(),
            false,
            false,
            None,
            Vec::new(),
            None,
            std::collections::HashMap::new(),
            None,
        )
        .await;
    handle
        .set_task_status(&task_id, crate::daemon::TaskStatus::Queued)
        .await;
    let _ = handle.tasks().await; // barrier: the status update has landed

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let lifecycle = Arc::new(ServerLifecycle::new(wire::DaemonOwner::Desktop));
    tokio::spawn(run_controlled(listener, handle, String::new(), lifecycle));

    let response = rpc(&mut connect(addr).await, 1, "app.quitCheck", json!({})).await;
    let blockers = response["result"]["blockers"].as_array().unwrap();
    assert!(
        blockers
            .iter()
            .any(|b| b.as_str().unwrap().contains("agent task")),
        "a queued task is a quit blocker: {blockers:?}"
    );
}

#[tokio::test]
async fn quit_check_counts_running_services() {
    let dir = tempfile::tempdir().unwrap();
    let config = dir.path().join(warpforge_protocol::identity::DIR);
    std::fs::create_dir_all(&config).unwrap();
    // Reaches `Running` through the readiness heuristic on stdout, so the test
    // binds no port and cannot collide with the global port allocation other
    // tests in this binary share.
    std::fs::write(
        config.join("workspace.yaml"),
        "name: demo\nservices:\n  web:\n    command: \"echo 'ready in 0ms'; sleep 60\"\n",
    )
    .unwrap();
    let projects = vec![ProjectEntry {
        name: "demo".into(),
        path: dir.path().to_string_lossy().into_owned(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }];
    let handle = Daemon::spawn(projects, None);
    handle
        .send(crate::daemon::actor::Command::StartService {
            project: "demo".into(),
            service: "web".into(),
        })
        .await;

    let mut running = false;
    for _ in 0..100 {
        let snapshot = handle.snapshot().await;
        if let Some(web) = snapshot.services.iter().find(|s| s.name == "web") {
            if web.status == warpforge_protocol::ServiceStatus::Running {
                running = true;
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert!(running, "the service should reach Running");

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let lifecycle = Arc::new(ServerLifecycle::new(wire::DaemonOwner::Desktop));
    tokio::spawn(run_controlled(listener, handle, String::new(), lifecycle));

    let response = rpc(&mut connect(addr).await, 1, "app.quitCheck", json!({})).await;
    let blockers = response["result"]["blockers"].as_array().unwrap();
    assert!(
        blockers
            .iter()
            .any(|b| b.as_str().unwrap().contains("service(s) are running")),
        "a running service is a quit blocker: {blockers:?}"
    );
}

#[tokio::test]
async fn app_quit_refuses_an_external_daemon() {
    let handle = Daemon::spawn(Vec::new(), None);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let server = tokio::spawn(run(listener, handle, String::new()));

    let response = rpc(&mut connect(addr).await, 1, "app.quit", json!({})).await;
    assert_eq!(response["error"]["code"], "conflict");
    assert!(response["error"]["message"]
        .as_str()
        .unwrap()
        .contains("started externally"));
    assert!(!server.is_finished(), "an external daemon keeps serving");
}

#[tokio::test]
async fn desktop_app_quit_acknowledges_then_stops_the_server() {
    let handle = Daemon::spawn(Vec::new(), None);
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let lifecycle = Arc::new(ServerLifecycle::new(wire::DaemonOwner::Desktop));
    let server = tokio::spawn(run_controlled(listener, handle, String::new(), lifecycle));

    let response = rpc(&mut connect(addr).await, 1, "app.quit", json!({})).await;
    assert!(response.get("result").is_some());
    timeout(Duration::from_secs(2), server)
        .await
        .expect("server should stop after acknowledging the quit")
        .unwrap()
        .unwrap();
}
