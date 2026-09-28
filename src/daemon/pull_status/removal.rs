//! Whether removing a task's worktree would lose work. Removal is
//! `git worktree remove --force` followed by `git branch -D`, so this check is
//! the only thing standing between unpushed commits and deletion.

use tokio::process::Command;

const DIRTY: &str = "the worktree has uncommitted changes; commit or discard them first";
const UNPUSHED: &str =
    "the worktree has commits that are not pushed or in the pull request; push them first";
const UNREADABLE: &str = "could not read the worktree's git state";

/// Why the worktree must stay, or `None` when removing it loses nothing.
///
/// Local HEAD is safe when the pull request's head commit contains it — that
/// holds after a squash merge and after GitHub deletes the head branch — or
/// when every commit it reaches is on a remote or another local branch.
///
/// @param worktree Path of the task's checkout.
/// @param head_oid Head commit of the task's pull request, when known.
/// @returns The refusal message, or `None` to allow removal.
pub(crate) async fn removal_blocker(
    worktree: &str,
    head_oid: Option<&str>,
) -> Option<&'static str> {
    let Some(status) = git(worktree, &["status", "--porcelain"]).await else {
        return Some(UNREADABLE);
    };
    if !status.is_empty() {
        return Some(DIRTY);
    }
    let Some(head) = git(worktree, &["rev-parse", "HEAD"]).await else {
        return Some(UNREADABLE);
    };
    if let Some(oid) = head_oid {
        if head == oid
            || git(worktree, &["merge-base", "--is-ancestor", "HEAD", oid])
                .await
                .is_some()
        {
            return None;
        }
    }
    // Deleting the task branch loses only what no other ref reaches.
    let branch = git(worktree, &["symbolic-ref", "-q", "--short", "HEAD"]).await;
    let exclude = branch.map(|name| format!("--exclude={name}"));
    let mut args = vec!["rev-list", "--count", "HEAD", "--not", "--remotes"];
    args.extend(exclude.as_deref());
    args.push("--branches");
    match git(worktree, &args).await {
        Some(count) if count == "0" => None,
        Some(_) => Some(UNPUSHED),
        None => Some(UNREADABLE),
    }
}

/// Trimmed stdout of a successful git command, `None` on failure.
async fn git(dir: &str, args: &[&str]) -> Option<String> {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .output()
        .await
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn run(dir: &Path, args: &[&str]) -> String {
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
        String::from_utf8_lossy(&out.stdout).trim().to_string()
    }

    fn commit(dir: &Path, file: &str) -> String {
        std::fs::write(dir.join(file), file).unwrap();
        run(dir, &["add", "."]);
        run(dir, &["commit", "-qm", file]);
        run(dir, &["rev-parse", "HEAD"])
    }

    /// A clone on a pushed `feature` branch whose remote copy was then
    /// deleted and pruned, as GitHub's auto-delete leaves it after a merge.
    fn merged_and_pruned() -> (tempfile::TempDir, String, String) {
        let root = tempfile::tempdir().unwrap();
        let origin = root.path().join("origin.git");
        run(
            root.path(),
            &[
                "init",
                "-q",
                "--bare",
                "-b",
                "main",
                origin.to_str().unwrap(),
            ],
        );
        run(
            root.path(),
            &["clone", "-q", origin.to_str().unwrap(), "work"],
        );
        let work = root.path().join("work");
        commit(&work, "base.txt");
        run(&work, &["push", "-q", "origin", "HEAD:main"]);
        run(&work, &["checkout", "-q", "-b", "feature"]);
        let pr_head = commit(&work, "feature.txt");
        run(&work, &["push", "-q", "origin", "feature"]);
        run(&work, &["push", "-q", "origin", "--delete", "feature"]);
        run(&work, &["fetch", "-q", "--prune"]);
        let path = work.to_string_lossy().into_owned();
        (root, path, pr_head)
    }

    #[tokio::test]
    async fn head_at_the_merged_pull_requests_head_is_removable_after_the_branch_is_gone() {
        let (_root, work, pr_head) = merged_and_pruned();
        assert_eq!(removal_blocker(&work, Some(&pr_head)).await, None);
        assert_eq!(
            removal_blocker(&work, None).await,
            Some(UNPUSHED),
            "without the pull request, the pruned branch's commit looks unpushed"
        );
    }

    #[tokio::test]
    async fn a_branch_with_nothing_of_its_own_is_removable_without_a_remote() {
        let root = tempfile::tempdir().unwrap();
        run(root.path(), &["init", "-q", "-b", "main"]);
        commit(root.path(), "base.txt");
        run(root.path(), &["checkout", "-q", "-b", "task"]);
        let repo = root.path().to_string_lossy().into_owned();
        assert_eq!(removal_blocker(&repo, None).await, None);
        commit(root.path(), "task.txt");
        assert_eq!(removal_blocker(&repo, None).await, Some(UNPUSHED));
    }

    #[tokio::test]
    async fn a_commit_made_after_the_merge_blocks_removal() {
        let (_root, work, pr_head) = merged_and_pruned();
        commit(Path::new(&work), "after-merge.txt");
        assert_eq!(removal_blocker(&work, Some(&pr_head)).await, Some(UNPUSHED));
    }

    #[tokio::test]
    async fn uncommitted_work_blocks_removal_and_pushed_work_does_not() {
        let (_root, work, pr_head) = merged_and_pruned();
        let dir = Path::new(&work);
        std::fs::write(dir.join("scratch.txt"), "unsaved").unwrap();
        assert_eq!(removal_blocker(&work, Some(&pr_head)).await, Some(DIRTY));
        std::fs::remove_file(dir.join("scratch.txt")).unwrap();

        commit(dir, "pushed.txt");
        run(dir, &["push", "-q", "origin", "feature"]);
        assert_eq!(removal_blocker(&work, Some(&pr_head)).await, None);
    }
}
