//! Safe merge-back for a task's worktree branch (ADR 0015 amendment).
//!
//! The merge never changes the HEAD or the working files of a checkout that is
//! not on the base branch. When the base is not checked out anywhere the ref is
//! moved with `git update-ref`, fast-forwarding or writing a merge commit built
//! by `git merge-tree` / `git commit-tree` — no checkout at all. When the base
//! *is* checked out, that checkout must be clean and the merge runs there.
//! A conflict leaves every ref unchanged.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use anyhow::{Context, Result};

use super::discover::parse_worktree_list;
use super::MergeResult;

/// Merge `branch` into `base_branch` without a manager, so the git work runs off
/// the daemon actor (ADR 0002). `worktree_path` is where `branch` is checked
/// out; it must be clean, and the branch must carry commits beyond the base.
pub async fn merge_detached(
    base_repo: &Path,
    worktree_path: &Path,
    branch: &str,
    base_branch: &str,
) -> Result<MergeResult> {
    if !is_clean(worktree_path, true).await? {
        return Ok(MergeResult::Refused(
            "commit or discard your changes first (including new files)".into(),
        ));
    }

    let base_sha = rev_parse(base_repo, base_branch).await?;
    let branch_sha = rev_parse(base_repo, branch).await?;
    let ahead = run_git(
        base_repo,
        &["rev-list", "--count", &format!("{base_branch}..{branch}")],
    )
    .await?;
    if !ahead.status.success() {
        return Ok(MergeResult::Error(
            String::from_utf8_lossy(&ahead.stderr).trim().to_string(),
        ));
    }
    if String::from_utf8_lossy(&ahead.stdout).trim() == "0" {
        return Ok(MergeResult::Refused("nothing to merge".into()));
    }

    // (a) The base is checked out somewhere: merge there, but only if clean.
    if let Some(checkout) = worktree_for_branch(base_repo, base_branch).await? {
        if !is_clean(&checkout, false).await? {
            return Ok(MergeResult::Refused(format!(
                "{base_branch} is checked out at {} with uncommitted changes",
                checkout.display()
            )));
        }
        return merge_in_checkout(&checkout, branch, base_branch).await;
    }

    // (b) Fast-forward: the base is an ancestor of the branch.
    let ancestor = run_git(
        base_repo,
        &["merge-base", "--is-ancestor", base_branch, branch],
    )
    .await?;
    if ancestor.status.success() {
        update_ref(base_repo, base_branch, &branch_sha, &base_sha).await?;
        return Ok(MergeResult::FastForward {
            branch: branch.to_string(),
        });
    }

    // (c) True merge with no checkout: build the tree, then the commit.
    if !merge_tree_supported().await {
        return Ok(MergeResult::Error(
            "git 2.38 or newer is required to merge without a checkout".into(),
        ));
    }
    let tree = run_git(
        base_repo,
        &[
            "merge-tree",
            "--write-tree",
            "--name-only",
            base_branch,
            branch,
        ],
    )
    .await?;
    if !tree.status.success() {
        let stdout = String::from_utf8_lossy(&tree.stdout);
        let files = conflict_files(&stdout);
        if files.is_empty() {
            let stderr = String::from_utf8_lossy(&tree.stderr).trim().to_string();
            return Ok(MergeResult::Error(stderr));
        }
        return Ok(MergeResult::Conflict {
            files: files.clone(),
            message: format!("merge conflicts in: {}", files.join(", ")),
        });
    }
    let tree_sha = String::from_utf8_lossy(&tree.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if tree_sha.is_empty() {
        return Ok(MergeResult::Error("git merge-tree wrote no tree".into()));
    }

    let message = format!("Merge branch '{branch}' into {base_branch}");
    let commit = run_git(
        base_repo,
        &[
            "commit-tree",
            &tree_sha,
            "-p",
            &base_sha,
            "-p",
            &branch_sha,
            "-m",
            &message,
        ],
    )
    .await?;
    if !commit.status.success() {
        return Ok(MergeResult::Error(
            String::from_utf8_lossy(&commit.stderr).trim().to_string(),
        ));
    }
    let commit_sha = String::from_utf8_lossy(&commit.stdout).trim().to_string();
    update_ref(base_repo, base_branch, &commit_sha, &base_sha).await?;
    Ok(MergeResult::Merged {
        branch: branch.to_string(),
        commit: commit_sha,
    })
}

/// Merge `branch` into the checkout that already has `base_branch` checked out.
/// On conflict, abort so the checkout is left exactly as it was found.
async fn merge_in_checkout(
    checkout: &Path,
    branch: &str,
    base_branch: &str,
) -> Result<MergeResult> {
    let output = run_git(checkout, &["merge", "--no-edit", branch]).await?;
    if output.status.success() {
        return Ok(MergeResult::Merged {
            branch: branch.to_string(),
            commit: rev_parse(checkout, "HEAD").await?,
        });
    }
    let message = {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stderr.is_empty() {
            stdout
        } else {
            stderr
        }
    };
    let files = unmerged_files(checkout).await;
    let _ = run_git(checkout, &["merge", "--abort"]).await;
    if files.is_empty() && !looks_like_conflict(&message) {
        return Ok(MergeResult::Error(message));
    }
    Ok(MergeResult::Conflict {
        files,
        message: format!("merging {branch} into {base_branch} failed: {message}"),
    })
}

/// Paths still unmerged in a checkout (mid-merge), for the conflict report.
async fn unmerged_files(checkout: &Path) -> Vec<String> {
    match run_git(checkout, &["diff", "--name-only", "--diff-filter=U"]).await {
        Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .map(str::to_string)
            .collect(),
        _ => Vec::new(),
    }
}

/// `true` when a checkout has no uncommitted changes. `include_untracked`
/// decides whether untracked files count as dirty: they do for the task
/// worktree (they would be left out of the merge), but not for the base
/// checkout — a user's root almost always has some, and `git merge` itself
/// refuses if an untracked file would be overwritten.
async fn is_clean(path: &Path, include_untracked: bool) -> Result<bool> {
    let mut args = vec!["status", "--porcelain"];
    if !include_untracked {
        args.push("--untracked-files=no");
    }
    let out = run_git(path, &args).await?;
    if !out.status.success() {
        anyhow::bail!(
            "git status failed in {}: {}",
            path.display(),
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(out.stdout.iter().all(|b| b.is_ascii_whitespace()))
}

/// Resolve a ref to its commit sha.
async fn rev_parse(repo: &Path, refname: &str) -> Result<String> {
    let out = run_git(repo, &["rev-parse", "--verify", refname]).await?;
    if !out.status.success() {
        anyhow::bail!(
            "cannot resolve {refname}: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Move `refs/heads/<base>` to `new`, refusing if it is no longer at `old`.
async fn update_ref(repo: &Path, base_branch: &str, new: &str, old: &str) -> Result<()> {
    let refname = format!("refs/heads/{base_branch}");
    let out = run_git(repo, &["update-ref", &refname, new, old]).await?;
    if !out.status.success() {
        anyhow::bail!(
            "could not update {base_branch}: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(())
}

/// The checkout that has `base_branch` checked out, if any — the root or another
/// worktree. Uses the same porcelain parse as the boot rebuild.
async fn worktree_for_branch(repo: &Path, base_branch: &str) -> Result<Option<PathBuf>> {
    let out = run_git(repo, &["worktree", "list", "--porcelain"]).await?;
    if !out.status.success() {
        return Ok(None);
    }
    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_worktree_list(&text)
        .into_iter()
        .find(|w| w.branch.as_deref() == Some(base_branch))
        .map(|w| w.path))
}

/// `git merge-tree --write-tree` needs git 2.38+. Probed once per process.
async fn merge_tree_supported() -> bool {
    static SUPPORTED: OnceLock<bool> = OnceLock::new();
    if let Some(v) = SUPPORTED.get() {
        return *v;
    }
    let supported = match run_git(Path::new("."), &["version"]).await {
        Ok(out) if out.status.success() => {
            parse_version(String::from_utf8_lossy(&out.stdout).trim()) >= (2, 38)
        }
        _ => false,
    };
    let _ = SUPPORTED.set(supported);
    supported
}

/// Parse `git version X.Y.Z...` into `(major, minor)`.
fn parse_version(text: &str) -> (u32, u32) {
    let mut nums = text
        .split_whitespace()
        .find(|t| t.chars().next().is_some_and(|c| c.is_ascii_digit()))
        .unwrap_or("")
        .split('.')
        .map(|p| {
            p.chars()
                .take_while(|c| c.is_ascii_digit())
                .collect::<String>()
        });
    let major = nums.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    let minor = nums.next().and_then(|s| s.parse().ok()).unwrap_or(0);
    (major, minor)
}

/// The conflicted paths from `merge-tree --write-tree --name-only` output:
/// the first line is the tree OID, then one path per line until a blank line.
fn conflict_files(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .skip(1)
        .take_while(|l| !l.trim().is_empty())
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect()
}

/// Best-effort "is this a merge conflict?" when no unmerged files were listed.
fn looks_like_conflict(message: &str) -> bool {
    message.to_lowercase().contains("conflict")
}

/// Run a git command in `cwd`, capturing output. `LC_ALL=C` keeps git's prose
/// and conflict markers stable regardless of the user's locale. Spawn failure
/// is an error; a non-zero exit is left for the caller to interpret.
async fn run_git(cwd: &Path, args: &[&str]) -> Result<std::process::Output> {
    tokio::process::Command::new("git")
        .args(args)
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .current_dir(cwd)
        .output()
        .await
        .with_context(|| format!("failed to run git {}", args.first().unwrap_or(&"")))
}
