use crate::daemon::actor::*;
use crate::daemon::store::Store;
use crate::daemon::task::{Task, TaskStatus};
use crate::registry::ProjectEntry;
use std::path::Path;
use std::time::Duration;
use tokio::sync::oneshot;

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/mock-acp-lifecycle.mjs"
);

fn project(dir: &Path) -> ProjectEntry {
    ProjectEntry {
        name: "demo".into(),
        path: dir.to_string_lossy().into_owned(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }
}

fn calls(log: &Path) -> Vec<serde_json::Value> {
    std::fs::read_to_string(log)
        .unwrap_or_default()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

async fn wait_call(log: &Path, method: &str) -> serde_json::Value {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Some(call) = calls(log).into_iter().find(|call| call["method"] == method) {
                break call;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("fixture receives the request")
}

async fn create(
    daemon: &DaemonHandle,
    agent: &str,
    parent: Option<String>,
    worktree: bool,
) -> String {
    daemon
        .create_task(
            "demo",
            "HOLD this task",
            agent,
            Vec::new(),
            false,
            worktree,
            parent,
            Vec::new(),
            None,
            Default::default(),
            None,
        )
        .await
}

async fn archive(daemon: &DaemonHandle, id: &str) {
    daemon.send(Command::ArchiveTask { id: id.into() }).await;
    // Snapshot reads bypass the actor; this command is the archive's boundary.
    tokio::time::timeout(Duration::from_secs(3), daemon.read_inbox("archive barrier"))
        .await
        .unwrap();
}

#[cfg(unix)]
fn process_gone(pid: i32) -> bool {
    // Signal zero inspects the exact owned fixture process; it changes nothing.
    unsafe {
        libc::kill(pid, 0) == -1
            && std::io::Error::last_os_error().raw_os_error() == Some(libc::ESRCH)
    }
}

#[cfg(unix)]
#[tokio::test]
async fn archiving_stops_every_live_descendant_including_grandchildren() {
    let dir = tempfile::tempdir().unwrap();
    let daemon = Daemon::spawn(vec![project(dir.path())], None);
    let mut ids = Vec::new();
    let mut pids = Vec::new();
    for index in 0..3 {
        let log = dir.path().join(format!("agent-{index}.log"));
        let agent = format!("node {FIXTURE} {}", log.display());
        let id = create(&daemon, &agent, ids.last().cloned(), false).await;
        let call = wait_call(&log, "session/prompt").await;
        ids.push(id);
        pids.push(call["pid"].as_i64().unwrap() as i32);
    }
    archive(&daemon, &ids[0]).await;
    let tasks = daemon.tasks().await;
    for id in &ids {
        let task = tasks.iter().find(|task| &task.id == id).unwrap();
        assert_eq!(task.status, TaskStatus::Done);
        assert!(task.queued_prompts.is_empty());
    }
    tokio::time::timeout(Duration::from_secs(5), async {
        while !pids.iter().all(|pid| process_gone(*pid)) {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("archiving must stop actual agent processes, not only their board status");
    daemon.shutdown().await;
}

#[tokio::test]
async fn archiving_a_reconnecting_task_rejects_its_pending_prompt() {
    let dir = tempfile::tempdir().unwrap();
    let log = dir.path().join("agent.log");
    let gate = dir.path().join("initialize.gate");
    let agent = format!("node {FIXTURE} {} {}", log.display(), gate.display());
    let store = Store::open_at(&dir.path().join("tasks.db")).unwrap();
    let mut task = Task::new("demo", "saved task", &agent, Vec::new());
    task.attach_session("saved-session".into());
    task.set_status(TaskStatus::Waiting);
    let id = task.id.clone();
    store.upsert_task(&task).unwrap();
    let daemon = Daemon::spawn(vec![project(dir.path())], Some(store));
    daemon
        .session_prompt(&id, "HOLD first", Vec::new())
        .await
        .unwrap();
    wait_call(&log, "initialize").await;
    let (tx, pending) = oneshot::channel();
    daemon
        .send(Command::SessionPrompt {
            task_id: id.clone(),
            text: "second".into(),
            attachments: Vec::new(),
            initiator: crate::daemon::acp::TurnInitiator::User,
            reply: tx,
        })
        .await;
    archive(&daemon, &id).await;
    let error = pending.await.unwrap().unwrap_err();
    assert!(error.contains("archived"));
    assert_eq!(
        daemon
            .tasks()
            .await
            .iter()
            .find(|task| task.id == id)
            .unwrap()
            .status,
        TaskStatus::Done
    );
    std::fs::write(gate, "go").unwrap();
    assert!(!calls(&log)
        .iter()
        .any(|call| call["method"] == "session/prompt"));
    daemon.shutdown().await;
}

#[cfg(unix)]
#[tokio::test]
async fn an_archived_task_never_starts_when_its_worktree_finishes_later() {
    let dir = tempfile::tempdir().unwrap();
    let ready = dir.path().join("setup-ready");
    let gate = dir.path().join("setup-release");
    let log = dir.path().join("agent.log");
    for args in [
        vec!["init", "-q", "-b", "main"],
        vec!["add", "README.md"],
        vec!["commit", "-qm", "initial"],
    ] {
        if args[0] == "add" {
            std::fs::write(dir.path().join("README.md"), "initial\n").unwrap();
        }
        let out = std::process::Command::new("git")
            .args(args)
            .current_dir(dir.path())
            .env("GIT_AUTHOR_NAME", "test")
            .env("GIT_AUTHOR_EMAIL", "test@example.com")
            .env("GIT_COMMITTER_NAME", "test")
            .env("GIT_COMMITTER_EMAIL", "test@example.com")
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
    }
    let config_dir = dir.path().join(".orchestrai");
    std::fs::create_dir_all(&config_dir).unwrap();
    let setup = format!(
        "touch '{}'; while [ ! -e '{}' ]; do sleep 0.01; done",
        ready.display(),
        gate.display()
    );
    std::fs::write(
        config_dir.join("workspace.yaml"),
        format!(
            "name: demo\nworktree:\n  setup: {}\n",
            serde_json::to_string(&setup).unwrap()
        ),
    )
    .unwrap();
    let daemon = Daemon::spawn(vec![project(dir.path())], None);
    let id = create(
        &daemon,
        &format!("node {FIXTURE} {}", log.display()),
        None,
        true,
    )
    .await;
    tokio::time::timeout(Duration::from_secs(5), async {
        while !ready.exists() {
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("setup holds the pending session start");
    archive(&daemon, &id).await;
    std::fs::write(gate, "go").unwrap();
    let task = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Some(task) = daemon
                .tasks()
                .await
                .into_iter()
                .find(|task| task.id == id && task.worktree.is_some())
            {
                break task;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("the completed checkout remains tracked");
    assert_eq!(task.status, TaskStatus::Done);
    assert_eq!(task.session_id, None);
    daemon.shutdown().await;
    assert!(
        !log.exists(),
        "a late checkout must never launch the archived task's agent"
    );
}
