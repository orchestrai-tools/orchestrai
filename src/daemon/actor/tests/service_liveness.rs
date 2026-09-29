//! A run that timed out is `Failed` but still alive: Start all leaves it
//! alone, an explicit Start replaces it, and quit and removal still count it.

use std::time::Duration;

use super::service_deps::{
    count, logs, project, start_all, stop_all, wait_for_count, wait_for_log, PROJECT,
};
use crate::daemon::actor::{Command, Daemon, ProjectRemovalError};
use crate::service::tests::bounded;

const TIMED_OUT: &str = "did not become ready within 300ms";

fn process_running(pid: &str) -> bool {
    pid.parse()
        .is_ok_and(|pid| crate::signal::signal_process(pid, 0))
}

fn pids(lines: &[String]) -> Vec<String> {
    lines
        .iter()
        .filter_map(|l| l.strip_prefix("api-pid-"))
        .map(str::to_string)
        .collect()
}

async fn stop_service(handle: &crate::daemon::actor::DaemonHandle, service: &str) {
    handle
        .send(Command::StopService {
            project: PROJECT.into(),
            service: service.into(),
        })
        .await;
}

#[tokio::test]
async fn start_all_leaves_a_timed_out_run_alone_and_start_replaces_it() {
    bounded(async {
        let (_dir, entry) = project(
            "name: x\nservices:\n  db:\n    command: echo db-up; sleep 30\n    readyPattern: db-up\n  api:\n    command: echo api-pid-$$; sleep 30\n    readyPattern: never printed\n    readyTimeout: 300ms\n    dependsOn: [db]\n",
        );
        let handle = Daemon::spawn(vec![entry], None);
        start_all(&handle).await;
        let first = wait_for_log(&handle, "api", TIMED_OUT).await;
        let old_pid = pids(&first).pop().expect("api logged its pid");
        assert!(process_running(&old_pid));

        stop_service(&handle, "db").await;
        start_all(&handle).await;
        wait_for_count(&handle, "db", "[service running]", 2).await;
        let api = logs(&handle, "api").await;
        assert_eq!(count(&api, "[service waiting for db]"), 1, "{api:?}");
        assert_eq!(count(&api, "[service restarting]"), 0, "{api:?}");
        assert!(process_running(&old_pid), "Start all must not kill it");

        stop_service(&handle, "db").await;
        handle
            .send(Command::StartService {
                project: PROJECT.into(),
                service: "api".into(),
            })
            .await;
        let restarted = wait_for_count(&handle, "api", "api-pid-", 2).await;
        let restart_at = restarted
            .iter()
            .position(|l| l.starts_with("[service restarting]"))
            .expect("an explicit Start says it replaced the run");
        let waiting_at = restarted
            .iter()
            .rposition(|l| l == "[service waiting for db]")
            .unwrap();
        assert!(restart_at < waiting_at, "{restarted:?}");
        assert_ne!(pids(&restarted).pop().unwrap(), old_pid);
        let mut old_gone = false;
        for _ in 0..40 {
            old_gone = !process_running(&old_pid);
            if old_gone {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(old_gone, "the replaced run is stopped, not orphaned");
        stop_all(&handle).await;
    })
    .await
}

#[tokio::test]
async fn a_timed_out_run_still_blocks_quit_and_project_removal() {
    bounded(async {
        let (_dir, entry) = project(
            "name: x\nservices:\n  api:\n    command: sleep 30\n    readyPattern: never printed\n    readyTimeout: 300ms\n",
        );
        let handle = Daemon::spawn(vec![entry], None);
        start_all(&handle).await;
        wait_for_log(&handle, "api", TIMED_OUT).await;

        let blockers = handle.quit_blockers().await;
        assert!(
            blockers.iter().any(|b| b == "1 service(s) are running"),
            "{blockers:?}"
        );
        let removal = handle.remove_project(PROJECT, false).await;
        assert!(
            matches!(&removal, Err(ProjectRemovalError::Conflict(m)) if m.contains("1 live service")),
            "{removal:?}"
        );
        stop_all(&handle).await;
    })
    .await
}
