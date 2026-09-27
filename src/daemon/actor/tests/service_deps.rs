//! `dependsOn` gating on the daemon actor: a dependent waits for its
//! dependency to be ready, starts once it is, and fails when it is not.

use std::time::Duration;

use tempfile::TempDir;

use crate::daemon::actor::handle::DaemonHandle;
use crate::daemon::actor::{Command, Daemon};
use crate::registry::ProjectEntry;

const PROJECT: &str = "service-deps-test";

fn project(config: &str) -> (TempDir, ProjectEntry) {
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

async fn logs(handle: &DaemonHandle, service: &str) -> Vec<String> {
    handle.service_logs(PROJECT, service, 0, None).await.0
}

async fn wait_for_log(handle: &DaemonHandle, service: &str, needle: &str) -> Vec<String> {
    for _ in 0..100 {
        let lines = logs(handle, service).await;
        if lines.iter().any(|l| l.contains(needle)) {
            return lines;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    panic!(
        "{service} never logged {needle:?}: {:?}",
        logs(handle, service).await
    );
}

async fn start_all(handle: &DaemonHandle) {
    handle
        .send(Command::StartAllServices {
            project: PROJECT.into(),
        })
        .await;
}

async fn stop_all(handle: &DaemonHandle) {
    handle
        .send(Command::StopProject {
            project: PROJECT.into(),
        })
        .await;
    handle.shutdown().await;
}

#[tokio::test]
async fn dependent_waits_then_fails_when_its_dependency_times_out() {
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
}

#[tokio::test]
async fn dependent_starts_once_its_dependency_is_ready() {
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
}

#[tokio::test]
async fn dependency_cycle_fails_instead_of_waiting_forever() {
    let (_dir, entry) = project(
        "name: x\nservices:\n  a:\n    command: sleep 30\n    dependsOn: [b]\n  b:\n    command: sleep 30\n    dependsOn: [a]\n",
    );
    let handle = Daemon::spawn(vec![entry], None);
    start_all(&handle).await;

    wait_for_log(&handle, "a", "its dependsOn chain is a cycle").await;
    wait_for_log(&handle, "b", "its dependsOn chain is a cycle").await;
    stop_all(&handle).await;
}

#[tokio::test]
async fn dependent_starts_when_a_timed_out_dependency_recovers() {
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
}
