//! Git worktree isolation: each task can optionally run in its own worktree so
//! parallel tasks don't conflict on the same working tree.
//!
//! A worktree is created under `<project>/.worktrees/<task_id>` on a branch
//! `warpforge/task/<task_id>` (derived from the current HEAD). When the task
//! completes the worktree can be merged back and removed, or left for manual
//! inspection.
//!
//! Split by topic: [`manager`] holds the manager's git operations, [`detached`]
//! the manager-free versions that run off the actor, and [`discover`] the boot
//! rebuild from persisted tasks.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

mod detached;
mod discover;
mod manager;

#[cfg(test)]
mod tests;

#[cfg(test)]
pub use detached::RemoveFn;
pub use detached::{
    create_branched_detached, create_detached, default_remover, merge_detached, remove_detached,
};
#[cfg(test)]
pub use discover::parse_worktree_list;

/// Metadata about one worktree.
#[derive(Debug, Clone)]
pub struct Worktree {
    pub task_id: String,
    pub path: PathBuf,
    pub branch: String,
    pub base_branch: String,
}

/// Manages git worktrees for a single project repo.
pub struct WorktreeManager {
    base_repo: PathBuf,
    worktrees: HashMap<String, Worktree>,
}

impl WorktreeManager {
    pub fn new(base_repo: PathBuf) -> Self {
        Self {
            base_repo,
            worktrees: HashMap::new(),
        }
    }

    /// The repo this manager tracks worktrees for.
    pub fn base_repo(&self) -> &Path {
        &self.base_repo
    }

    /// Drop a worktree from the map without touching git — for a removal that
    /// already ran off the actor (see [`remove_detached`]).
    pub fn forget(&mut self, task_id: &str) -> Option<Worktree> {
        self.worktrees.remove(task_id)
    }

    /// This task's worktree metadata, if the manager tracks one.
    pub fn get(&self, task_id: &str) -> Option<&Worktree> {
        self.worktrees.get(task_id)
    }

    /// Record a worktree created outside the manager (see [`create_detached`]).
    pub fn adopt(&mut self, wt: Worktree) {
        self.worktrees.insert(wt.task_id.clone(), wt);
    }

    /// The branch and path a branched worktree would inherit from, if the
    /// source task has a worktree here.
    pub fn source_state(&self, source_task_id: &str) -> Option<(String, PathBuf)> {
        self.worktrees
            .get(source_task_id)
            .map(|wt| (wt.branch.clone(), wt.path.clone()))
    }

    /// Get the working directory for a task (worktree path if it exists,
    /// otherwise the base repo).
    pub fn cwd(&self, task_id: &str) -> &Path {
        self.worktrees
            .get(task_id)
            .map(|wt| wt.path.as_path())
            .unwrap_or(&self.base_repo)
    }

    /// Check if a task has a worktree.
    pub fn has_worktree(&self, task_id: &str) -> bool {
        self.worktrees.contains_key(task_id)
    }

    /// List all active worktrees.
    pub fn list(&self) -> Vec<&Worktree> {
        self.worktrees.values().collect()
    }
}

#[derive(Debug)]
pub enum MergeResult {
    Ok { branch: String },
    Conflict { message: String, branch: String },
    Error(String),
}
