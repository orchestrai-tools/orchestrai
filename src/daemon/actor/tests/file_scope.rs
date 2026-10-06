//! Reading, saving and searching must agree on the selected task worktree.
use crate::daemon::actor::{Command, Daemon};
use crate::daemon::store::Store;
use crate::daemon::task::{Task, TaskStatus};
use crate::registry::ProjectEntry;
use tokio::sync::oneshot;

#[tokio::test]
async fn task_save_and_search_do_not_touch_the_project_checkout() {
    let project = tempfile::tempdir().unwrap();
    let worktree = tempfile::tempdir().unwrap();
    let db = tempfile::tempdir().unwrap();
    std::fs::write(project.path().join("notes.txt"), "project original").unwrap();
    std::fs::write(worktree.path().join("notes.txt"), "task original").unwrap();
    let store = Store::open_at(&db.path().join("test.db")).unwrap();
    let mut task = Task::new("demo", "fixture", "codex", vec![]);
    task.status = TaskStatus::Waiting;
    task.worktree = Some(worktree.path().to_string_lossy().into_owned());
    store.upsert_task(&task).unwrap();
    let handle = Daemon::spawn(
        vec![ProjectEntry {
            name: "demo".into(),
            path: project.path().to_string_lossy().into_owned(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        }],
        Some(store),
    );

    let (tx, rx) = oneshot::channel();
    handle
        .cmd_tx
        .send(Command::SaveFile {
            task_id: task.id.clone(),
            project: Some("demo".into()),
            path: "notes.txt".into(),
            content: "TASK_SEARCH_MARKER".into(),
            reply: tx,
        })
        .await
        .unwrap();
    rx.await.unwrap().unwrap();
    assert_eq!(
        std::fs::read_to_string(project.path().join("notes.txt")).unwrap(),
        "project original"
    );
    assert_eq!(
        std::fs::read_to_string(worktree.path().join("notes.txt")).unwrap(),
        "TASK_SEARCH_MARKER"
    );
    let matches = handle
        .search_files(&task.id, "TASK_SEARCH_MARKER", 10, Some("demo".into()))
        .await;
    assert_eq!(matches.len(), 1);
    assert_eq!(matches[0].path, "notes.txt");

    let (tx, rx) = oneshot::channel();
    handle
        .cmd_tx
        .send(Command::SaveFile {
            task_id: "unknown-task".into(),
            project: Some("demo".into()),
            path: "notes.txt".into(),
            content: "wrong checkout".into(),
            reply: tx,
        })
        .await
        .unwrap();
    assert!(rx.await.unwrap().is_err());
    assert_eq!(
        std::fs::read_to_string(project.path().join("notes.txt")).unwrap(),
        "project original"
    );
    handle.shutdown().await;
}
