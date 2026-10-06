use crate::daemon::actor::event::*;
use crate::daemon::actor::*;
use crate::registry::ProjectEntry;

fn demo_project() -> ProjectEntry {
    ProjectEntry {
        name: "project-removal-test".into(),
        path: ".".into(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }
}

#[test]
fn resource_guard_message_is_actionable_and_reports_live_counts() {
    let live = ProjectLiveResources {
        sessions: 0,
        services: 2,
        portforwards: 1,
        terminals: 3,
    };

    assert!(live.any());
    assert_eq!(
            live.conflict_message("demo"),
            "Project \"demo\" has 2 live services, 1 live port-forward, 3 live terminals; retry project.remove with stop_resources=true to stop them and remove the registration"
        );
}

#[test]
fn stopped_project_state_does_not_require_force() {
    assert!(!ProjectLiveResources::default().any());
}

#[tokio::test]
async fn live_terminal_blocks_unforced_project_removal() {
    let handle = Daemon::spawn(vec![demo_project()], None);
    let terminal_id = handle
        .spawn_agent(
            "project-removal-test",
            "sleep 30",
            "guard test",
            80,
            24,
            None,
        )
        .await
        .unwrap();

    let error = handle
        .remove_project("project-removal-test", false)
        .await
        .unwrap_err();

    assert!(matches!(error, ProjectRemovalError::Conflict(_)));
    assert!(handle
        .snapshot()
        .await
        .terminals
        .iter()
        .any(|terminal| terminal.id == terminal_id));
    handle.shutdown().await;
}

#[tokio::test]
async fn task_archive_and_delete_do_not_kill_project_terminal() {
    let handle = Daemon::spawn(vec![demo_project()], None);
    let terminal_id = handle
        .spawn_agent(
            "project-removal-test",
            "sleep 30",
            "task lifecycle test",
            80,
            24,
            None,
        )
        .await
        .unwrap();
    let archived_task = handle
        .create_task(
            "project-removal-test",
            "archive me",
            "codex",
            Vec::new(),
            false,
            false,
            None,
            Vec::new(),
            None,
            HashMap::new(),
            None,
        )
        .await;
    let deleted_task = handle
        .create_task(
            "project-removal-test",
            "delete me",
            "codex",
            Vec::new(),
            false,
            false,
            None,
            Vec::new(),
            None,
            HashMap::new(),
            None,
        )
        .await;

    handle
        .send(Command::ArchiveTask { id: archived_task })
        .await;
    handle
        .delete_task(&deleted_task)
        .await
        .expect("task deletion should complete");

    assert!(handle
        .snapshot()
        .await
        .terminals
        .iter()
        .any(|terminal| terminal.id == terminal_id));
    handle.shutdown().await;
}

#[tokio::test]
async fn deleting_a_task_kills_its_terminal() {
    let handle = Daemon::spawn(vec![demo_project()], None);
    let task = handle
        .create_task(
            "project-removal-test",
            "delete me",
            "codex",
            Vec::new(),
            false,
            false,
            None,
            Vec::new(),
            None,
            HashMap::new(),
            None,
        )
        .await;
    let terminal_id = handle
        .spawn_agent(
            "project-removal-test",
            "sleep 30",
            "task terminal",
            80,
            24,
            Some(task.clone()),
        )
        .await
        .unwrap();
    assert!(handle
        .snapshot()
        .await
        .terminals
        .iter()
        .any(|terminal| terminal.id == terminal_id));

    handle
        .delete_task(&task)
        .await
        .expect("task deletion should complete");

    assert!(!handle
        .snapshot()
        .await
        .terminals
        .iter()
        .any(|terminal| terminal.id == terminal_id));
    handle.shutdown().await;
}

#[tokio::test]
async fn archiving_a_task_keeps_its_terminal_running() {
    let handle = Daemon::spawn(vec![demo_project()], None);
    let task = handle
        .create_task(
            "project-removal-test",
            "archive me",
            "codex",
            Vec::new(),
            false,
            false,
            None,
            Vec::new(),
            None,
            HashMap::new(),
            None,
        )
        .await;
    let terminal_id = handle
        .spawn_agent(
            "project-removal-test",
            "sleep 30",
            "task terminal",
            80,
            24,
            Some(task.clone()),
        )
        .await
        .unwrap();

    handle.send(Command::ArchiveTask { id: task.clone() }).await;

    assert!(handle
        .snapshot()
        .await
        .terminals
        .iter()
        .any(|terminal| terminal.id == terminal_id));
    handle.shutdown().await;
}

/// An ACP session stays alive between turns even though the board says Waiting.
#[cfg(unix)]
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn removal_guards_and_reaps_idle_acp_sessions() {
    use crate::daemon::task::TaskStatus;
    use std::time::Duration;

    let dir = tempfile::tempdir().unwrap();
    let project = format!("agent-removal-{}", uuid::Uuid::new_v4());
    let pid_file = dir.path().join("agent.pid");
    let fixture = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-inspect.mjs"
    );
    let handle = Daemon::spawn(
        vec![ProjectEntry {
            name: project.clone(),
            path: dir.path().to_string_lossy().into_owned(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        }],
        None,
    );
    let command = format!(
        "printf '%s' $$ > '{}'; exec node '{fixture}'",
        pid_file.display()
    );
    let task = handle
        .create_task(
            &project,
            "finish one turn",
            &command,
            Vec::new(),
            false,
            false,
            None,
            Vec::new(),
            None,
            HashMap::new(),
            None,
        )
        .await;
    tokio::time::timeout(Duration::from_secs(10), async {
        loop {
            if pid_file.exists()
                && handle
                    .tasks()
                    .await
                    .iter()
                    .any(|row| row.id == task && row.status == TaskStatus::Waiting)
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    })
    .await
    .expect("mock agent never finished its turn");
    let pid: i32 = std::fs::read_to_string(pid_file).unwrap().parse().unwrap();
    // SAFETY: signal zero only checks liveness; pid belongs to this test's agent.
    assert_eq!(unsafe { libc::kill(pid, 0) }, 0);
    let error = handle.remove_project(&project, false).await.unwrap_err();
    assert!(matches!(error, ProjectRemovalError::Conflict(_)));
    assert!(error.to_string().contains("1 live agent session"));
    // The test never registers with the real registry. Teardown still happens
    // before that final unregister reports NotFound, and must await child exit.
    let error = handle.remove_project(&project, true).await.unwrap_err();
    assert!(matches!(error, ProjectRemovalError::Internal(_)));
    // SAFETY: as above, no signal is delivered.
    assert_eq!(unsafe { libc::kill(pid, 0) }, -1);
    assert_eq!(
        std::io::Error::last_os_error().raw_os_error(),
        Some(libc::ESRCH)
    );
    assert!(handle.tasks().await.iter().any(|row| row.id == task));
    handle.shutdown().await;
}
