//! The project `worktree:` config and the Worktrees panel's RPCs.

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

fn git(dir: &Path, args: &[&str]) -> String {
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
    String::from_utf8_lossy(&out.stdout).into_owned()
}

fn project(setup: &str) -> (tempfile::TempDir, DaemonHandle, Arc<ServerLifecycle>) {
    let repo = tempfile::tempdir().unwrap();
    git(repo.path(), &["init", "-q", "-b", "main"]);
    std::fs::write(repo.path().join("README.md"), "init\n").unwrap();
    git(repo.path(), &["add", "."]);
    git(repo.path(), &["commit", "-qm", "init"]);
    std::fs::write(repo.path().join(".env"), "TOKEN=1\n").unwrap();
    std::fs::create_dir_all(repo.path().join(warpforge_protocol::identity::DIR)).unwrap();
    std::fs::write(
        repo.path().join(".orchestrai/workspace.yaml"),
        format!("name: demo\nworktree:\n  copy: ['.env*']\n  setup: \"{setup}\"\n"),
    )
    .unwrap();
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
    (repo, handle, lifecycle)
}

async fn new_task(handle: &DaemonHandle) -> String {
    handle
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
        .await
}

async fn wait_for(handle: &DaemonHandle, id: &str, done: impl Fn(&Task) -> bool) -> Task {
    for _ in 0..400 {
        let task = handle.tasks().await.into_iter().find(|t| t.id == id);
        if let Some(task) = task.filter(|t| done(t)) {
            return task;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("task {id} never reached the expected state");
}

async fn list(handle: &DaemonHandle, lifecycle: &Arc<ServerLifecycle>) -> Vec<wire::WorktreeRow> {
    let value = dispatch(
        handle,
        wire::Method::WorktreeList {
            project: "demo".into(),
        },
        lifecycle,
    )
    .await
    .unwrap();
    serde_json::from_value(value["worktrees"].clone()).unwrap()
}

#[tokio::test]
async fn a_new_worktree_gets_the_copied_files_and_the_setup_run() {
    let (_repo, handle, lifecycle) = project("touch setup-ran");
    let id = new_task(&handle).await;
    let task = wait_for(&handle, &id, |t| {
        t.worktree.is_some() && t.status != TaskStatus::Running
    })
    .await;
    let wt = task.worktree.unwrap();
    assert_eq!(
        std::fs::read_to_string(Path::new(&wt).join(".env")).unwrap(),
        "TOKEN=1\n"
    );
    assert!(Path::new(&wt).join("setup-ran").exists());
    let rows = list(&handle, &lifecycle).await;
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].task_id.as_deref(), Some(id.as_str()));
    assert!(!rows[0].orphan && rows[0].has_setup_log);
    assert!(rows[0].size_bytes.unwrap() > 0);
}

#[tokio::test]
async fn a_failing_setup_blocks_the_task_but_keeps_the_worktree() {
    let (_repo, handle, lifecycle) = project("echo nope; exit 3");
    let id = new_task(&handle).await;
    let task = wait_for(&handle, &id, |t| t.status == TaskStatus::Blocked).await;
    let reason = task.blocked_reason.unwrap();
    assert!(
        reason.contains("worktree setup failed") && reason.contains("nope"),
        "{reason}"
    );
    let wt = task.worktree.expect("worktree kept");
    assert!(Path::new(&wt).exists());
    let log = dispatch(
        &handle,
        wire::Method::WorktreeSetupLog { task_id: id },
        &lifecycle,
    )
    .await
    .unwrap();
    assert!(log["log"].as_str().unwrap().contains("nope"));
}

#[tokio::test]
async fn orphans_are_listed_and_removed_only_when_clean() {
    let (repo, handle, lifecycle) = project("true");
    let orphan = repo.path().join(".orchestrai/worktrees/orphan");
    git(
        repo.path(),
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "warpforge/task/orphan",
            orphan.to_str().unwrap(),
        ],
    );
    let elsewhere = repo.path().parent().unwrap().join("wf-panel-elsewhere");
    let _ = std::fs::remove_dir_all(&elsewhere);
    git(
        repo.path(),
        &[
            "worktree",
            "add",
            "-q",
            "--detach",
            elsewhere.to_str().unwrap(),
        ],
    );
    let rows = list(&handle, &lifecycle).await;
    assert_eq!(
        rows.len(),
        1,
        "a checkout outside the managed folders is not listed"
    );
    assert!(rows[0].orphan && rows[0].task_id.is_none());
    assert_eq!(rows[0].branch.as_deref(), Some("warpforge/task/orphan"));

    let remove = |path: String| wire::Method::WorktreeRemoveOrphan {
        project: "demo".into(),
        path,
    };
    let path = rows[0].path.clone();
    std::fs::write(orphan.join("scratch.txt"), "unsaved").unwrap();
    let refused = dispatch(&handle, remove(path.clone()), &lifecycle)
        .await
        .expect_err("dirty");
    assert_eq!(refused.code, wire::ErrorCode::Conflict);
    assert!(orphan.exists());

    let unlisted = dispatch(
        &handle,
        remove(elsewhere.to_string_lossy().into_owned()),
        &lifecycle,
    )
    .await
    .expect_err("not a managed worktree");
    assert_eq!(unlisted.code, wire::ErrorCode::NotFound);

    std::fs::remove_file(orphan.join("scratch.txt")).unwrap();
    dispatch(&handle, remove(path), &lifecycle).await.unwrap();
    assert!(!orphan.exists());
    assert!(git(repo.path(), &["branch", "--list", "warpforge/task/orphan"]).is_empty());
    git(
        repo.path(),
        &["worktree", "remove", "--force", elsewhere.to_str().unwrap()],
    );
}

#[tokio::test]
async fn reclaim_clears_build_output_inside_the_named_worktree_only() {
    let (repo, handle, lifecycle) = project("true");
    let orphan = repo.path().join(".orchestrai/worktrees/orphan");
    git(
        repo.path(),
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "warpforge/task/orphan",
            orphan.to_str().unwrap(),
        ],
    );
    std::fs::create_dir_all(orphan.join("node_modules/a")).unwrap();
    std::fs::write(orphan.join("node_modules/a/i.js"), "x").unwrap();
    std::fs::create_dir_all(repo.path().join("node_modules")).unwrap();
    let path = list(&handle, &lifecycle).await[0].path.clone();
    let out = dispatch(
        &handle,
        wire::Method::WorktreeReclaim {
            project: "demo".into(),
            path,
        },
        &lifecycle,
    )
    .await
    .unwrap();
    assert!(out["freedBytes"].as_u64().unwrap() > 0);
    assert!(!orphan.join("node_modules").exists());
    assert!(repo.path().join("node_modules").exists());
    assert!(orphan.join("README.md").exists());
}
