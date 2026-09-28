//! `task.archive` with `remove_worktree`: the merged-pull-request cleanup.

use super::*;
use crate::daemon::task::{Task, TaskStatus};
use crate::daemon::Daemon;
use crate::registry::ProjectEntry;
use std::path::Path;
use std::time::Duration;

const MOCK_AGENT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/mock-acp-inspect.mjs"
);

fn git(dir: &Path, args: &[&str]) {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_AUTHOR_NAME", "test")
        .env("GIT_AUTHOR_EMAIL", "t@t")
        .env("GIT_COMMITTER_NAME", "test")
        .env("GIT_COMMITTER_EMAIL", "t@t")
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?} failed");
}

async fn task_now(handle: &DaemonHandle, id: &str) -> Task {
    handle
        .tasks()
        .await
        .into_iter()
        .find(|task| task.id == id)
        .expect("task on the board")
}

async fn wait_for(handle: &DaemonHandle, id: &str, done: impl Fn(&Task) -> bool) -> Task {
    for _ in 0..200 {
        let task = task_now(handle, id).await;
        if done(&task) {
            return task;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("task {id} never reached the expected state");
}

fn archive(id: &str) -> wire::Method {
    wire::Method::TaskArchive {
        task_id: id.to_string(),
        remove_worktree: true,
    }
}

#[tokio::test]
async fn a_dirty_worktree_is_kept_and_a_clean_one_is_removed_with_the_archive() {
    let repo = tempfile::tempdir().unwrap();
    git(repo.path(), &["init", "-q", "-b", "main"]);
    std::fs::write(repo.path().join("README.md"), "init\n").unwrap();
    git(repo.path(), &["add", "."]);
    git(repo.path(), &["commit", "-qm", "init"]);
    let handle = Daemon::spawn(
        vec![ProjectEntry {
            name: "demo".into(),
            path: repo.path().to_string_lossy().into_owned(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        }],
        None,
    );
    let lifecycle = Arc::new(ServerLifecycle::new(wire::DaemonOwner::Desktop));
    let id = handle
        .create_task(
            "demo",
            "do the thing",
            &format!("node {MOCK_AGENT}"),
            Vec::new(),
            false,
            true,
            None,
            Vec::new(),
            None,
            Default::default(),
            None,
        )
        .await;
    let task = wait_for(&handle, &id, |task| {
        task.worktree.is_some() && task.status != TaskStatus::Running
    })
    .await;
    let worktree = task.worktree.unwrap();
    std::fs::write(Path::new(&worktree).join("scratch.txt"), "unsaved\n").unwrap();

    let refused = dispatch(&handle, archive(&id), &lifecycle)
        .await
        .expect_err("uncommitted work blocks removal");
    assert_eq!(refused.code, wire::ErrorCode::Conflict);
    let kept = task_now(&handle, &id).await;
    assert_eq!(kept.worktree.as_deref(), Some(worktree.as_str()));
    assert_ne!(kept.status, TaskStatus::Done);

    std::fs::remove_file(Path::new(&worktree).join("scratch.txt")).unwrap();
    dispatch(&handle, archive(&id), &lifecycle)
        .await
        .expect("a clean checkout is removed");
    let archived = wait_for(&handle, &id, |task| task.status == TaskStatus::Done).await;
    assert!(archived.worktree.is_none());
    for _ in 0..200 {
        if !Path::new(&worktree).exists() {
            return;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("the worktree folder was not removed");
}
