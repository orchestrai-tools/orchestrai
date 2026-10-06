//! Git ops on a project's own checkout, with no task open: the Changes page
//! on the main branch stashes, branches and pushes through a project scope.

use crate::daemon::actor::*;
use crate::registry::ProjectEntry;
use std::path::Path;
use warpforge_protocol as wire;

fn git(dir: &Path, args: &[&str]) -> String {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_AUTHOR_NAME", "test")
        .env("GIT_AUTHOR_EMAIL", "t@t")
        .env("GIT_COMMITTER_NAME", "test")
        .env("GIT_COMMITTER_EMAIL", "t@t")
        .env("LC_ALL", "C")
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "git {args:?} failed: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn project(dir: &Path) -> DaemonHandle {
    Daemon::spawn(
        vec![ProjectEntry {
            name: "demo".into(),
            path: dir.to_string_lossy().into_owned(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        }],
        None,
    )
}

fn demo() -> RepoScope {
    RepoScope::new(String::new(), Some("demo".into()))
}

#[tokio::test]
async fn project_scope_stashes_branches_and_pushes_without_a_task() {
    let remote = tempfile::tempdir().unwrap();
    git(remote.path(), &["init", "-q", "--bare", "-b", "main"]);
    let dir = tempfile::tempdir().unwrap();
    let repo = dir.path();
    git(repo, &["init", "-q", "-b", "main"]);
    git(repo, &["config", "user.name", "test"]);
    git(repo, &["config", "user.email", "t@t"]);
    std::fs::write(repo.join("README.md"), "init\n").unwrap();
    git(repo, &["add", "."]);
    git(repo, &["commit", "-qm", "init"]);
    git(
        repo,
        &["remote", "add", "origin", &remote.path().to_string_lossy()],
    );
    git(repo, &["push", "-q", "-u", "origin", "main"]);
    let handle = project(repo);

    std::fs::write(repo.join("README.md"), "edited\n").unwrap();
    handle
        .stash_push(demo(), "wip".into(), None)
        .await
        .expect("stash on the project checkout");
    assert_eq!(
        std::fs::read_to_string(repo.join("README.md")).unwrap(),
        "init\n"
    );
    let stashes = handle.stash_list(demo()).await.entries;
    assert_eq!(stashes.len(), 1);
    handle
        .stash_apply(demo(), &stashes[0].id, true)
        .await
        .expect("pop the stash back");
    assert_eq!(
        std::fs::read_to_string(repo.join("README.md")).unwrap(),
        "edited\n"
    );

    let created = handle
        .git_branch_create(demo(), "feature/x", None, true, false)
        .await;
    assert_eq!(created.status, wire::GitOpStatus::Ok, "{}", created.message);
    assert_eq!(git(repo, &["branch", "--show-current"]), "feature/x");

    handle
        .git_commit(demo(), "edit", None, false)
        .await
        .expect("commit on the branch");
    let pushed = handle.git_push(demo(), false).await;
    assert_eq!(pushed.status, wire::GitOpStatus::Ok, "{}", pushed.message);
    assert_eq!(
        git(remote.path(), &["log", "-1", "--format=%s", "feature/x"]),
        "edit"
    );
}

#[tokio::test]
async fn unknown_project_scope_names_the_project_in_the_error() {
    let dir = tempfile::tempdir().unwrap();
    let handle = project(dir.path());
    let missing = RepoScope::new(String::new(), Some("ghost".into()));
    let err = handle
        .stash_push(missing.clone(), String::new(), None)
        .await;
    assert_eq!(err.unwrap_err(), "no repo for project ghost");
    let push = handle.git_push(missing, false).await;
    assert_eq!(push.status, wire::GitOpStatus::Error);
    assert_eq!(push.message, "no repo for project ghost");
}

#[test]
fn a_task_id_wins_over_a_project() {
    assert_eq!(
        RepoScope::new("t1".into(), Some("demo".into())),
        RepoScope::Task("t1".into())
    );
    assert_eq!(demo(), RepoScope::Project("demo".into()));
}
