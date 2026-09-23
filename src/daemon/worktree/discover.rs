//! Boot rebuild: reconstruct a project's tracked worktrees from the persisted
//! tasks, cross-checked against `git worktree list --porcelain` (ADR 0015).

use std::path::{Path, PathBuf};

use super::{Worktree, WorktreeManager};

impl WorktreeManager {
    /// Rebuild tracked worktrees from persisted tasks at boot (ADR 0015).
    /// `None` porcelain (git failed) adopts and clears nothing; only an
    /// unlisted path that is also gone from disk is reported for clearing.
    pub fn restore(&mut self, tasks: &[(String, String)], porcelain: Option<&str>) -> Vec<String> {
        let Some(porcelain) = porcelain else {
            return Vec::new();
        };
        let listed = parse_worktree_list(porcelain);
        // The repo's own checkout is the first entry; its current branch is the
        // best guess available for what a restored worktree branched from.
        let base_branch = listed
            .first()
            .and_then(|w| w.branch.clone())
            .unwrap_or_else(|| "main".to_string());
        let mut missing = Vec::new();
        for (task_id, recorded) in tasks {
            let path = Path::new(recorded);
            match listed.iter().find(|w| paths_equal(&w.path, path)) {
                Some(w) => {
                    let branch = w
                        .branch
                        .clone()
                        .unwrap_or_else(|| format!("warpforge/task/{task_id}"));
                    self.worktrees.insert(
                        task_id.clone(),
                        Worktree {
                            task_id: task_id.clone(),
                            path: path.to_path_buf(),
                            branch,
                            base_branch: base_branch.clone(),
                        },
                    );
                }
                None if path.exists() => {}
                None => missing.push(task_id.clone()),
            }
        }
        missing
    }
}

/// One entry of `git worktree list --porcelain`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PorcelainWorktree {
    pub path: PathBuf,
    /// Branch name with `refs/heads/` stripped; `None` when detached.
    pub branch: Option<String>,
    pub detached: bool,
}

/// Parse `git worktree list --porcelain` into its entries. Pure, so the boot
/// rebuild is testable without a repo.
pub fn parse_worktree_list(output: &str) -> Vec<PorcelainWorktree> {
    fn flush(current: &mut Option<PorcelainWorktree>, out: &mut Vec<PorcelainWorktree>) {
        if let Some(entry) = current.take() {
            out.push(entry);
        }
    }
    let mut out = Vec::new();
    let mut current: Option<PorcelainWorktree> = None;
    for line in output.lines() {
        if let Some(path) = line.strip_prefix("worktree ") {
            flush(&mut current, &mut out);
            current = Some(PorcelainWorktree {
                path: PathBuf::from(path),
                branch: None,
                detached: false,
            });
        } else if let Some(rest) = line.strip_prefix("branch ") {
            if let Some(entry) = current.as_mut() {
                entry.branch = Some(rest.trim_start_matches("refs/heads/").to_string());
            }
        } else if line == "detached" {
            if let Some(entry) = current.as_mut() {
                entry.detached = true;
            }
        }
    }
    flush(&mut current, &mut out);
    out
}

/// Compare two worktree paths tolerantly: git reports real paths, while a
/// persisted task may hold the path as constructed — which differs under a
/// symlinked temp dir (`/var` vs `/private/var` on macOS).
fn paths_equal(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}
