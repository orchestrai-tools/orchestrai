//! Project config file watching.

use crate::daemon::Daemon;
use crate::registry::ProjectEntry;
use std::time::Duration;
use tokio::time::timeout;

#[tokio::test]
async fn config_save_broadcasts_project_config_changed() {
    let project_dir = tempfile::tempdir().unwrap();
    let config_path = project_dir.path().join(".warpforge.yaml");
    std::fs::write(
        &config_path,
        "name: demo\nservices:\n  old:\n    command: old\n    port: 3000\n",
    )
    .unwrap();
    let projects = vec![ProjectEntry {
        name: "demo".into(),
        path: project_dir.path().to_string_lossy().into_owned(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }];
    let handle = Daemon::spawn(projects, None);
    let mut events = handle.subscribe();
    std::fs::write(
            &config_path,
            "name: demo\nservices:\n  web:\n    command: bun dev\n    port: 5173\nportforwards:\n  - name: db\n    namespace: dev\n    pod: postgres\n    localPort: 5432\n    remotePort: 5432\n",
        )
        .unwrap();

    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        let event = timeout(remaining, events.recv())
            .await
            .expect("project.configChanged event")
            .expect("daemon event");
        if let crate::daemon::Event::ProjectConfigChanged(config) = event {
            assert_eq!(config.project.declared_services, ["web"]);
            assert_eq!(config.services[0].command, "bun dev");
            assert_eq!(config.portforwards[0].name, "db");
            break;
        }
    }
}

#[tokio::test]
async fn local_override_file_edit_broadcasts_flagged_services() {
    let project_dir = tempfile::tempdir().unwrap();
    let warpforge = project_dir.path().join(".warpforge");
    std::fs::create_dir_all(&warpforge).unwrap();
    std::fs::write(
        warpforge.join("workspace.yaml"),
        "name: demo\nservices:\n  web:\n    command: bun dev\n    port: 5173\n  db:\n    command: pg\n    port: 5432\n",
    )
    .unwrap();
    let projects = vec![ProjectEntry {
        name: "demo".into(),
        path: project_dir.path().to_string_lossy().into_owned(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }];
    let handle = Daemon::spawn(projects, None);
    let mut events = handle.subscribe();
    std::fs::write(
        warpforge.join("workspace.local.yaml"),
        "services:\n  web:\n    port: 5999\n  db: null\n",
    )
    .unwrap();

    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        let event = timeout(remaining, events.recv())
            .await
            .expect("project.configChanged event")
            .expect("daemon event");
        if let crate::daemon::Event::ProjectConfigChanged(config) = event {
            assert_eq!(config.project.declared_services, ["web"]);
            assert_eq!(config.services[0].original_port, 5999);
            assert!(config.services[0].local);
            assert_eq!(config.services[0].local_fields, ["port"]);
            break;
        }
    }
    let ignore = std::fs::read_to_string(warpforge.join(".gitignore")).unwrap();
    assert!(ignore.contains("workspace.local.yaml"));
}

#[tokio::test]
async fn broken_local_file_keeps_shared_services_and_reports_the_error() {
    let project_dir = tempfile::tempdir().unwrap();
    let warpforge = project_dir.path().join(".warpforge");
    std::fs::create_dir_all(&warpforge).unwrap();
    std::fs::write(
        warpforge.join("workspace.yaml"),
        "name: demo\nservices:\n  web:\n    command: bun dev\n    port: 5173\n",
    )
    .unwrap();
    let local = warpforge.join("workspace.local.yaml");
    std::fs::write(&local, "services:\n  extra:\n    port: 1\n").unwrap();
    let projects = vec![ProjectEntry {
        name: "demo".into(),
        path: project_dir.path().to_string_lossy().into_owned(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }];
    let handle = Daemon::spawn(projects, None);
    let snapshot = handle.snapshot().await;
    assert_eq!(snapshot.projects[0].declared_services, ["web"]);
    let error = snapshot.projects[0].local_config_error.clone().unwrap();
    assert!(error.contains("workspace.local.yaml"), "{error}");

    let mut events = handle.subscribe();
    std::fs::write(&local, "services:\n  web:\n    port: 5999\n").unwrap();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        let event = timeout(remaining, events.recv())
            .await
            .expect("project.configChanged event")
            .expect("daemon event");
        if let crate::daemon::Event::ProjectConfigChanged(config) = event {
            assert_eq!(config.project.local_config_error, None);
            assert_eq!(config.services[0].original_port, 5999);
            break;
        }
    }
}
