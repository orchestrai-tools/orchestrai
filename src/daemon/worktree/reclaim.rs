//! Delete build artifacts inside one worktree, leaving the checkout usable.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result};
use walkdir::WalkDir;

use super::size::disk_usage;
use crate::daemon::diff::HEAVY_DIRS;

const MEASURE_BUDGET: Duration = Duration::from_secs(120);

/// [`HEAVY_DIRS`] minus the entries that are not artifacts.
fn is_artifact_dir(name: &str) -> bool {
    name != ".git" && name != ".worktrees" && HEAVY_DIRS.contains(&name)
}

/// Remove every build/dependency directory (`node_modules`, `target`, ...) at
/// any depth under `worktree`. A directory holding tracked files, and anything
/// inside a nested repository, is left alone.
///
/// @param worktree The worktree to clean; nothing outside it is touched.
/// @returns Bytes freed.
pub fn reclaim_artifacts(worktree: &Path) -> Result<u64> {
    let mut found: Vec<PathBuf> = Vec::new();
    let mut walk = WalkDir::new(worktree).follow_links(false).into_iter();
    while let Some(entry) = walk.next() {
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_dir() || entry.depth() == 0 {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if name == ".git" || entry.path().join(".git").exists() {
            walk.skip_current_dir();
        } else if is_artifact_dir(&name) {
            walk.skip_current_dir();
            if !has_tracked_files(worktree, entry.path()) {
                found.push(entry.path().to_owned());
            }
        }
    }
    let mut freed = 0;
    for dir in found {
        freed += disk_usage(&dir, MEASURE_BUDGET).unwrap_or(0);
        std::fs::remove_dir_all(&dir).with_context(|| format!("removing {}", dir.display()))?;
    }
    Ok(freed)
}

fn has_tracked_files(worktree: &Path, dir: &Path) -> bool {
    let Ok(rel) = dir.strip_prefix(worktree) else {
        return true;
    };
    std::process::Command::new("git")
        .arg("-C")
        .arg(worktree)
        .args(["ls-files", "-z", "--"])
        .arg(rel)
        .output()
        .map(|out| !out.status.success() || !out.stdout.is_empty())
        .unwrap_or(true)
}
