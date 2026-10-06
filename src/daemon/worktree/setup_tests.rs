use std::path::Path;
use std::time::Duration;

use super::reclaim::reclaim_artifacts;
use super::setup::{apply, copy_files, setup_log_path};
use crate::worktree_config::WorktreeConfig;

fn write(root: &Path, rel: &str, body: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, body).unwrap();
}

fn pats(list: &[&str]) -> Vec<String> {
    list.iter().map(|s| s.to_string()).collect()
}

#[test]
fn copy_matches_globs_and_keeps_nested_paths() {
    let (root, dest) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    write(root.path(), ".env", "A=1");
    write(root.path(), ".env.local", "B=2");
    write(root.path(), "config/local.json", "{}");
    write(root.path(), "config/deep/x.json", "{}");
    write(root.path(), "README.md", "no");
    let copied = copy_files(
        root.path(),
        dest.path(),
        &pats([".env*", "config/*.json"].as_slice()),
    )
    .unwrap();
    assert_eq!(copied, 3);
    assert!(dest.path().join(".env.local").exists());
    assert!(dest.path().join("config/local.json").exists());
    assert!(!dest.path().join("config/deep/x.json").exists());
    assert!(!dest.path().join("README.md").exists());
}

#[test]
fn copy_skips_git_missing_files_and_existing_targets() {
    let (root, dest) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    write(root.path(), ".git/config", "secret");
    write(root.path(), "sub/.git", "gitdir: x");
    write(root.path(), "node_modules/pkg/.env", "x");
    write(root.path(), ".env", "new");
    write(dest.path(), ".env", "old");
    let copied = copy_files(
        root.path(),
        dest.path(),
        &pats(["**/*", ".*", "missing.txt"].as_slice()),
    )
    .unwrap();
    assert_eq!(copied, 0);
    assert_eq!(
        std::fs::read_to_string(dest.path().join(".env")).unwrap(),
        "old"
    );
    assert!(!dest.path().join(".git").exists());
    assert!(!dest.path().join("sub/.git").exists());
    assert!(!dest.path().join("node_modules").exists());
}

#[cfg(unix)]
#[test]
fn copy_never_follows_symlinks_out_of_the_root() {
    let (root, dest, outside) = (
        tempfile::tempdir().unwrap(),
        tempfile::tempdir().unwrap(),
        tempfile::tempdir().unwrap(),
    );
    write(outside.path(), "secret.txt", "s");
    std::os::unix::fs::symlink(outside.path(), root.path().join("link")).unwrap();
    std::os::unix::fs::symlink(outside.path().join("secret.txt"), root.path().join("file"))
        .unwrap();
    let copied = copy_files(root.path(), dest.path(), &pats(["**/*"].as_slice())).unwrap();
    assert_eq!(copied, 0);
    assert_eq!(std::fs::read_dir(dest.path()).unwrap().count(), 0);
}

fn config(setup: &str) -> WorktreeConfig {
    WorktreeConfig {
        copy: Vec::new(),
        setup: Some(setup.into()),
    }
}

async fn run(
    setup: &str,
    timeout: Duration,
) -> (Option<String>, tempfile::TempDir, tempfile::TempDir) {
    let (root, wt) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
    std::fs::create_dir_all(root.path().join(".orchestrai/worktrees")).unwrap();
    let out = apply(root.path(), wt.path(), "t_1", &config(setup), timeout).await;
    (out, root, wt)
}

#[tokio::test]
async fn setup_runs_in_the_worktree_and_logs_output() {
    let (out, root, wt) = run("echo hello; touch ran", Duration::from_secs(10)).await;
    assert_eq!(out, None);
    assert!(wt.path().join("ran").exists());
    let log = std::fs::read_to_string(setup_log_path(root.path(), "t_1")).unwrap();
    assert_eq!(log.trim(), "hello");
}

#[tokio::test]
async fn a_failing_setup_reports_the_exit_and_output() {
    let (out, root, wt) = run("echo boom >&2; exit 1", Duration::from_secs(10)).await;
    let message = out.expect("failure is reported");
    assert!(
        message.contains("failed") && message.contains("boom"),
        "{message}"
    );
    assert!(wt.path().exists());
    assert!(setup_log_path(root.path(), "t_1").exists());
}

#[tokio::test]
async fn a_slow_setup_times_out() {
    let started = std::time::Instant::now();
    let (out, _root, _wt) = run("sleep 30", Duration::from_millis(200)).await;
    assert!(out.unwrap().contains("timed out"));
    assert!(started.elapsed() < Duration::from_secs(10));
}

fn git(dir: &Path, args: &[&str]) {
    let out = std::process::Command::new("git")
        .args(args)
        .current_dir(dir)
        .env("GIT_AUTHOR_NAME", "t")
        .env("GIT_AUTHOR_EMAIL", "t@t")
        .env("GIT_COMMITTER_NAME", "t")
        .env("GIT_COMMITTER_EMAIL", "t@t")
        .output()
        .unwrap();
    assert!(out.status.success(), "git {args:?} failed");
}

#[test]
fn reclaim_removes_only_artifact_directories() {
    let repo = tempfile::tempdir().unwrap();
    git(repo.path(), &["init", "-q", "-b", "main"]);
    write(repo.path(), "src/main.rs", "fn main() {}");
    write(repo.path(), "dist/tracked.js", "1");
    write(repo.path(), "pkg/dist/tracked.js", "1");
    write(repo.path(), ".env", "keep");
    git(repo.path(), &["add", "."]);
    git(repo.path(), &["commit", "-qm", "init"]);
    write(repo.path(), "node_modules/a/index.js", "x");
    write(repo.path(), "app/node_modules/b/index.js", "x");
    write(repo.path(), "target/debug/bin", "x");
    write(repo.path(), "sub/.git", "gitdir: elsewhere");
    write(repo.path(), "sub/node_modules/c.js", "x");

    let freed = reclaim_artifacts(repo.path()).unwrap();
    assert!(freed > 0);
    assert!(!repo.path().join("node_modules").exists());
    assert!(!repo.path().join("app/node_modules").exists());
    assert!(!repo.path().join("target").exists());
    assert!(repo.path().join("src/main.rs").exists());
    assert!(repo.path().join(".env").exists());
    assert!(repo.path().join(".git").exists());
    assert!(repo.path().join("dist/tracked.js").exists());
    assert!(repo.path().join("pkg/dist/tracked.js").exists());
    assert!(repo.path().join("sub/node_modules/c.js").exists());
}
