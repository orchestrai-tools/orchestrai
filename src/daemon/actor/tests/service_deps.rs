//! `dependsOn` gating on the daemon actor: a dependent waits for its
//! dependency to be ready, starts once it is, and fails when it is not.

use std::time::Duration;

use tempfile::TempDir;

use crate::daemon::actor::handle::DaemonHandle;
use crate::daemon::actor::{Command, Daemon};
use crate::registry::ProjectEntry;
use crate::service::tests::bounded;

pub(super) const PROJECT: &str = "service-deps-test";

pub(super) fn project(config: &str) -> (TempDir, ProjectEntry) {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join(".warpforge/workspace.yaml");
    std::fs::create_dir_all(file.parent().unwrap()).unwrap();
    std::fs::write(file, config).unwrap();
    let entry = ProjectEntry {
        name: PROJECT.into(),
        path: dir.path().to_str().unwrap().into(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    };
    (dir, entry)
}

pub(super) async fn logs(handle: &DaemonHandle, service: &str) -> Vec<String> {
    handle.service_logs(PROJECT, service, 0, None).await.0
}

pub(super) async fn wait_for_log(
    handle: &DaemonHandle,
    service: &str,
    needle: &str,
) -> Vec<String> {
    wait_for_count(handle, service, needle, 1).await
}

pub(super) fn count(lines: &[String], needle: &str) -> usize {
    lines.iter().filter(|l| l.contains(needle)).count()
}

/// Wait until `service` has logged at least `n` lines containing `needle`.
pub(super) async fn wait_for_count(
    handle: &DaemonHandle,
    service: &str,
    needle: &str,
    n: usize,
) -> Vec<String> {
    for _ in 0..100 {
        let lines = logs(handle, service).await;
        if count(&lines, needle) >= n {
            return lines;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!(
        "{service} never logged {needle:?} {n} time(s): {:?}",
        logs(handle, service).await
    );
}

pub(super) async fn start_all(handle: &DaemonHandle) {
    handle
        .send(Command::StartAllServices {
            project: PROJECT.into(),
        })
        .await;
}

pub(super) async fn stop_all(handle: &DaemonHandle) {
    handle
        .send(Command::StopProject {
            project: PROJECT.into(),
        })
        .await;
    handle.shutdown().await;
}

#[tokio::test]
async fn dependent_waits_then_fails_when_its_dependency_times_out() {
    bounded(async {
        let (_dir, entry) = project(
            "name: x\nservices:\n  db:\n    command: sleep 30\n    readyPattern: never printed\n    readyTimeout: 300ms\n  api:\n    command: sleep 30\n    dependsOn: [db]\n",
        );
        let handle = Daemon::spawn(vec![entry], None);
        start_all(&handle).await;

        let early = wait_for_log(&handle, "api", "[service waiting for db]").await;
        assert!(!early.iter().any(|l| l.contains("failed")), "{early:?}");

        wait_for_log(&handle, "db", "did not become ready within 300ms").await;
        let api = wait_for_log(&handle, "api", "[service failed]").await;
        assert!(
            api.iter()
                .any(|l| l == "[service failed] did not start: dependency db failed"),
            "{api:?}"
        );
        stop_all(&handle).await;
    })
    .await
}

#[tokio::test]
async fn dependent_starts_once_its_dependency_is_ready() {
    bounded(async {
        let (_dir, entry) = project(
            "name: x\nservices:\n  db:\n    command: sleep 0.3; echo db-up; sleep 30\n    readyPattern: db-up\n  api:\n    command: echo api-spawned; sleep 30\n    dependsOn: [db]\n",
        );
        let handle = Daemon::spawn(vec![entry], None);
        start_all(&handle).await;

        wait_for_log(&handle, "api", "[service waiting for db]").await;
        wait_for_log(&handle, "db", "[service running]").await;
        let api = wait_for_log(&handle, "api", "api-spawned").await;
        assert!(!api.iter().any(|l| l.contains("failed")), "{api:?}");
        stop_all(&handle).await;
    })
    .await
}

#[tokio::test]
async fn dependency_cycle_fails_instead_of_waiting_forever() {
    bounded(async {
        let (_dir, entry) = project(
            "name: x\nservices:\n  a:\n    command: sleep 30\n    dependsOn: [b]\n  b:\n    command: sleep 30\n    dependsOn: [a]\n",
        );
        let handle = Daemon::spawn(vec![entry], None);
        start_all(&handle).await;

        wait_for_log(&handle, "a", "its dependsOn chain is a cycle").await;
        wait_for_log(&handle, "b", "its dependsOn chain is a cycle").await;
        stop_all(&handle).await;
    })
    .await
}

#[tokio::test]
async fn dependent_starts_when_a_timed_out_dependency_recovers() {
    bounded(async {
        let (_dir, entry) = project(
            "name: x\nservices:\n  db:\n    command: sleep 0.8; echo db-up; sleep 30\n    readyPattern: db-up\n    readyTimeout: 300ms\n  api:\n    command: echo api-spawned; sleep 30\n    dependsOn: [db]\n",
        );
        let handle = Daemon::spawn(vec![entry], None);
        start_all(&handle).await;

        wait_for_log(&handle, "db", "did not become ready within 300ms").await;
        wait_for_log(
            &handle,
            "api",
            "[service failed] did not start: dependency db failed",
        )
        .await;
        wait_for_log(&handle, "db", "[service ready] after").await;
        wait_for_log(&handle, "api", "api-spawned").await;
        stop_all(&handle).await;
    })
    .await
}

/// Allocating `api`'s port needs a localhost bind; a sandbox that refuses one
/// fails this test at the allocation, not at the behaviour under test.
#[tokio::test]
async fn a_waiting_service_already_has_the_port_its_dependents_use() {
    bounded(async {
        let (_dir, entry) = project(
            "name: x\nservices:\n  db:\n    command: sleep 0.5; echo db-up; sleep 30\n    readyPattern: db-up\n  api:\n    command: echo api-spawned; sleep 30\n    port: 3000\n    dependsOn: [db]\n  web:\n    command: echo \"web-sees-$API_URL\"; sleep 30\n    env:\n      API_URL: http://localhost:${api.port}\n",
        );
        let handle = Daemon::spawn(vec![entry], None);
        start_all(&handle).await;

        let web = wait_for_log(&handle, "web", "web-sees-").await;
        assert!(!web.iter().any(|l| l.contains("failed")), "{web:?}");
        let api_port = |snapshot: &warpforge_protocol::Snapshot| {
            let api = snapshot.services.iter().find(|s| s.name == "api").unwrap();
            api.allocated_port
        };
        let reserved = api_port(&handle.snapshot().await);
        assert!(reserved > 0, "the placeholder holds a port");
        assert!(
            web.contains(&format!("web-sees-http://localhost:{reserved}")),
            "{web:?}"
        );

        wait_for_log(&handle, "api", "api-spawned").await;
        assert_eq!(
            api_port(&handle.snapshot().await),
            reserved,
            "api starts on the port web was given"
        );
        stop_all(&handle).await;
    })
    .await
}

#[tokio::test]
async fn stopping_a_port_forward_fails_the_services_waiting_on_it() {
    bounded(async {
        let forward = |name: &str, port: u16| {
            format!("  - name: {name}\n    namespace: dev\n    pod: {name}\n    localPort: {port}\n    remotePort: 5432\n")
        };
        let (_dir, entry) = project(&format!(
            "name: x\nservices:\n  api:\n    command: sleep 30\n    dependsOn: [tunnel-a]\n  worker:\n    command: sleep 30\n    dependsOn: [tunnel-b]\nportforwards:\n{}{}",
            forward("tunnel-a", 45432),
            forward("tunnel-b", 45433),
        ));
        let handle = Daemon::spawn(vec![entry], None);
        start_all(&handle).await;
        wait_for_log(&handle, "api", "[service waiting for tunnel-a]").await;
        wait_for_log(&handle, "worker", "[service waiting for tunnel-b]").await;

        handle
            .send(Command::StopPortForward {
                project: PROJECT.into(),
                name: "tunnel-a".into(),
            })
            .await;
        wait_for_log(&handle, "api", "dependency tunnel-a is stopped").await;
        let worker = logs(&handle, "worker").await;
        assert!(!worker.iter().any(|l| l.contains("failed")), "{worker:?}");

        handle
            .send(Command::StopAllPortForwards {
                project: PROJECT.into(),
            })
            .await;
        wait_for_log(&handle, "worker", "dependency tunnel-b is stopped").await;
        stop_all(&handle).await;
    })
    .await
}

#[tokio::test]
async fn a_declared_forward_with_no_runtime_entry_is_started_not_skipped() {
    bounded(async {
        let config = |port: u16| {
            format!("name: x\nservices:\n  api:\n    command: echo api-spawned; sleep 30\n    dependsOn: [tunnel]\nportforwards:\n  - name: tunnel\n    namespace: dev\n    pod: db\n    localPort: {port}\n    remotePort: 5432\n")
        };
        let (dir, entry) = project(&config(45440));
        let handle = Daemon::spawn(vec![entry], None);
        start_all(&handle).await;
        wait_for_log(&handle, "api", "[service waiting for tunnel]").await;

        // A changed forward is removed from the runtime, leaving only its declaration.
        std::fs::write(dir.path().join(".warpforge/workspace.yaml"), config(45441)).unwrap();
        let mut restarted = false;
        for _ in 0..100 {
            let snapshot = handle.snapshot().await;
            restarted = snapshot.portforwards.iter().any(|pf| {
                pf.local_port == 45441 && pf.status == warpforge_protocol::PortForwardStatus::Starting
            });
            if restarted {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(restarted, "the redeclared forward is started for api");
        tokio::time::sleep(Duration::from_millis(200)).await;
        let api = logs(&handle, "api").await;
        assert!(
            !api.iter()
                .any(|l| l.contains("api-spawned") || l.contains("failed")),
            "api keeps waiting on the forward: {api:?}"
        );
        stop_all(&handle).await;
    })
    .await
}

/// Needs a localhost listener; a sandbox that refuses the bind fails this
/// test at the bind, not at the behaviour under test.
#[tokio::test]
async fn a_forward_whose_port_is_already_served_is_used_not_started() {
    bounded(async {
        let local = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = local.local_addr().unwrap().port();
        let (_dir, entry) = project(&format!(
            "name: x\nservices:\n  api:\n    command: echo api-spawned; sleep 30\n    dependsOn: [tunnel]\nportforwards:\n  - name: tunnel\n    namespace: dev\n    pod: db\n    localPort: {port}\n    remotePort: 8123\n"
        ));
        let handle = Daemon::spawn(vec![entry], None);
        start_all(&handle).await;

        let api = wait_for_log(&handle, "api", "api-spawned").await;
        assert!(
            api.contains(&format!("[dependency tunnel: port {port} is already served locally — using it instead of starting the forward]")),
            "{api:?}"
        );
        let snapshot = handle.snapshot().await;
        let tunnel = snapshot.portforwards.iter().find(|pf| pf.name == "tunnel");
        assert_eq!(
            tunnel.map(|pf| pf.status),
            Some(warpforge_protocol::PortForwardStatus::Stopped)
        );
        stop_all(&handle).await;
        drop(local);
    })
    .await
}
