//! Safe-merge tests (ADR 0015 amendment): every case the merge must handle
//! without touching the HEAD or files of a checkout that is not on the base.

use std::path::{Path, PathBuf};

use super::merge_detached;
use super::MergeResult;

/// Run git in `dir`, asserting success; returns trimmed stdout.
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

fn write(dir: &Path, name: &str, body: &str) {
    std::fs::write(dir.join(name), body).unwrap();
}

/// A repo on `main` with one commit and a linked worktree on branch `task`
/// holding one commit. Returns `(root, task_worktree)`. The worktree lives
/// under `.worktrees/`, hidden from the root's status as in production.
fn repo_with_task_commit() -> (tempfile::TempDir, PathBuf) {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path().to_path_buf();
    git(&root, &["init", "-q", "-b", "main"]);
    // The code under test runs its own git commands without the env identity;
    // CI runners have no global one, so the repo carries it.
    git(&root, &["config", "user.name", "test"]);
    git(&root, &["config", "user.email", "t@t"]);
    write(&root, "f", "base\n");
    git(&root, &["add", "."]);
    git(&root, &["commit", "-qm", "init"]);

    let wt = root.join(".worktrees").join("task");
    git(
        &root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "task",
            wt.to_str().unwrap(),
            "main",
        ],
    );
    let raw = git(&root, &["rev-parse", "--git-path", "info/exclude"]);
    let exclude = if Path::new(&raw).is_absolute() {
        PathBuf::from(raw)
    } else {
        root.join(raw)
    };
    std::fs::write(exclude, ".worktrees/\n").unwrap();

    write(&wt, "f", "task\n");
    git(&wt, &["add", "."]);
    git(&wt, &["commit", "-qm", "task work"]);
    (tmp, wt)
}

fn head(dir: &Path) -> String {
    git(dir, &["rev-parse", "HEAD"])
}

fn branch_sha(dir: &Path, branch: &str) -> String {
    git(dir, &["rev-parse", branch])
}

#[tokio::test]
async fn fast_forwards_when_base_is_not_checked_out() {
    let (tmp, wt) = repo_with_task_commit();
    let root = tmp.path();
    // Base not checked out anywhere: root moves to a detached/other branch.
    git(root, &["checkout", "-q", "-b", "elsewhere"]);
    let root_before = head(root);
    let task_sha = branch_sha(root, "task");

    let result = merge_detached(root, &wt, "task", "main").await.unwrap();
    assert!(
        matches!(result, MergeResult::FastForward { .. }),
        "{result:?}"
    );
    assert_eq!(
        branch_sha(root, "main"),
        task_sha,
        "main moved to the branch"
    );
    assert_eq!(head(root), root_before, "root HEAD untouched");
    assert_eq!(std::fs::read_to_string(root.join("f")).unwrap(), "base\n");
}

#[tokio::test]
async fn true_merge_without_checkout_when_base_advanced() {
    let (tmp, wt) = repo_with_task_commit();
    let root = tmp.path();
    // Advance main while the task branch forks off the old tip.
    git(root, &["checkout", "-q", "main"]);
    write(root, "g", "main side\n");
    git(root, &["add", "."]);
    git(root, &["commit", "-qm", "main work"]);
    git(root, &["checkout", "-q", "-b", "elsewhere"]);
    let root_before = head(root);

    let result = merge_detached(root, &wt, "task", "main").await.unwrap();
    match result {
        MergeResult::Merged { commit, .. } => {
            assert_eq!(branch_sha(root, "main"), commit);
            let parents = git(root, &["rev-list", "--parents", "-n", "1", "main"]);
            assert_eq!(
                parents.split_whitespace().count(),
                3,
                "merge commit has two parents"
            );
        }
        other => panic!("expected a merge commit, got {other:?}"),
    }
    assert_eq!(head(root), root_before, "root HEAD untouched");
    assert_eq!(std::fs::read_to_string(root.join("f")).unwrap(), "base\n");
    assert_eq!(
        std::fs::read_to_string(root.join("g")).unwrap(),
        "main side\n"
    );
    // Both sides landed on main.
    let merged = git(root, &["show", "main:f"]);
    assert_eq!(merged, "task");
}

#[tokio::test]
async fn conflict_without_checkout_leaves_base_unchanged() {
    let (tmp, wt) = repo_with_task_commit();
    let root = tmp.path();
    // Conflicting commit on main.
    git(root, &["checkout", "-q", "main"]);
    write(root, "f", "main side\n");
    git(root, &["add", "."]);
    git(root, &["commit", "-qm", "conflict"]);
    let main_before = branch_sha(root, "main");
    git(root, &["checkout", "-q", "-b", "elsewhere"]);
    let root_file_before = std::fs::read_to_string(root.join("f")).unwrap();

    let result = merge_detached(root, &wt, "task", "main").await.unwrap();
    match result {
        MergeResult::Conflict { files, .. } => {
            assert!(files.contains(&"f".to_string()), "{files:?}")
        }
        other => panic!("expected a conflict, got {other:?}"),
    }
    assert_eq!(branch_sha(root, "main"), main_before, "base ref unchanged");
    assert_eq!(
        std::fs::read_to_string(root.join("f")).unwrap(),
        root_file_before,
        "root files unchanged"
    );
}

#[tokio::test]
async fn merges_in_root_when_base_is_checked_out_and_clean() {
    let (tmp, wt) = repo_with_task_commit();
    let root = tmp.path();
    // Root stays on main.
    let result = merge_detached(root, &wt, "task", "main").await.unwrap();
    assert!(matches!(result, MergeResult::Merged { .. }), "{result:?}");
    assert_eq!(git(root, &["rev-parse", "--abbrev-ref", "HEAD"]), "main");
    assert_eq!(std::fs::read_to_string(root.join("f")).unwrap(), "task\n");
}

#[tokio::test]
async fn merges_in_root_despite_an_unrelated_untracked_file() {
    let (tmp, wt) = repo_with_task_commit();
    let root = tmp.path();
    // A user's root almost always has untracked files; they must not block a
    // merge, since git itself refuses if one would be overwritten.
    write(root, "scratch.log", "noise\n");

    let result = merge_detached(root, &wt, "task", "main").await.unwrap();
    assert!(matches!(result, MergeResult::Merged { .. }), "{result:?}");
    assert_eq!(std::fs::read_to_string(root.join("f")).unwrap(), "task\n");
    assert!(root.join("scratch.log").exists(), "untracked file kept");
}

#[tokio::test]
async fn refuses_when_base_checkout_is_dirty() {
    let (tmp, wt) = repo_with_task_commit();
    let root = tmp.path();
    // A tracked modification, not an untracked file: untracked files do not
    // block the merge (git itself refuses if one would be overwritten).
    write(root, "f", "dirty\n");
    let main_before = branch_sha(root, "main");

    let result = merge_detached(root, &wt, "task", "main").await.unwrap();
    assert!(matches!(result, MergeResult::Refused(_)), "{result:?}");
    assert_eq!(branch_sha(root, "main"), main_before, "base ref unchanged");
    assert_eq!(std::fs::read_to_string(root.join("f")).unwrap(), "dirty\n");
}

#[tokio::test]
async fn refuses_when_task_worktree_is_dirty() {
    let (tmp, wt) = repo_with_task_commit();
    let root = tmp.path();
    write(&wt, "dirty", "wip\n");
    let main_before = branch_sha(root, "main");

    let result = merge_detached(root, &wt, "task", "main").await.unwrap();
    match result {
        MergeResult::Refused(reason) => assert!(reason.contains("commit or discard"), "{reason}"),
        other => panic!("expected a refusal, got {other:?}"),
    }
    assert_eq!(branch_sha(root, "main"), main_before);
}

#[tokio::test]
async fn refuses_when_branch_has_no_commits_beyond_base() {
    let tmp = tempfile::tempdir().unwrap();
    let root = tmp.path();
    git(root, &["init", "-q", "-b", "main"]);
    write(root, "f", "base\n");
    git(root, &["add", "."]);
    git(root, &["commit", "-qm", "init"]);
    let wt = root.join("wt");
    git(
        root,
        &[
            "worktree",
            "add",
            "-q",
            "-b",
            "task",
            wt.to_str().unwrap(),
            "main",
        ],
    );

    let result = merge_detached(root, &wt, "task", "main").await.unwrap();
    match result {
        MergeResult::Refused(reason) => assert!(reason.contains("nothing to merge"), "{reason}"),
        other => panic!("expected a refusal, got {other:?}"),
    }
}

/// The base checked out in the root is the only checkout a merge may change;
/// a merge that targets an unchecked-out base must leave the root's files and
/// HEAD exactly as they were.
#[tokio::test]
async fn root_on_another_branch_is_untouched() {
    let (tmp, wt) = repo_with_task_commit();
    let root = tmp.path();
    git(root, &["checkout", "-q", "-b", "feature"]);
    write(root, "only-on-feature", "x\n");
    git(root, &["add", "."]);
    git(root, &["commit", "-qm", "feature"]);
    let before = head(root);

    merge_detached(root, &wt, "task", "main").await.unwrap();

    assert_eq!(head(root), before, "root HEAD must not move");
    assert_eq!(git(root, &["rev-parse", "--abbrev-ref", "HEAD"]), "feature");
    assert!(
        root.join("only-on-feature").exists(),
        "root files untouched"
    );
    assert_eq!(std::fs::read_to_string(root.join("f")).unwrap(), "base\n");
}
