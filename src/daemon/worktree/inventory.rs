//! The worktrees Warpforge manages for a project, straight from git.

use std::path::{Path, PathBuf};

use anyhow::{bail, Result};

use super::discover::{parse_worktree_list, paths_equal};
use super::merge::run_git;
use super::WORKTREES_REL;

/// One managed worktree as git reports it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Listed {
    pub path: PathBuf,
    /// `None` on a detached HEAD.
    pub branch: Option<String>,
}

/// Worktrees of `base_repo` that live under `.orchestrai/worktrees` or the
/// legacy `.worktrees`. Checkouts the user made elsewhere are not Warpforge's
/// to list or remove.
///
/// @param base_repo The project root.
/// @returns The worktrees, or an error when git cannot list them.
pub async fn list_managed(base_repo: &Path) -> Result<Vec<Listed>> {
    let out = run_git(base_repo, &["worktree", "list", "--porcelain"]).await?;
    if !out.status.success() {
        bail!("could not list worktrees");
    }
    let root = base_repo
        .canonicalize()
        .unwrap_or_else(|_| base_repo.to_path_buf());
    let dirs = [root.join(WORKTREES_REL), root.join(".worktrees")];
    let listed = parse_worktree_list(&String::from_utf8_lossy(&out.stdout));
    Ok(listed
        .into_iter()
        .filter(|w| {
            let real = w.path.canonicalize().unwrap_or_else(|_| w.path.clone());
            dirs.iter().any(|dir| real.starts_with(dir))
        })
        .map(|w| Listed {
            path: w.path,
            branch: w.branch,
        })
        .collect())
}

/// Whether two worktree paths name the same directory, tolerating symlinked
/// prefixes such as `/var` and `/private/var`.
///
/// @param a First path.
/// @param b Second path.
/// @returns `true` when they resolve to the same location.
pub fn same_path(a: &Path, b: &Path) -> bool {
    paths_equal(a, b)
}
