//! Payloads of the per-project worktree inventory.

use serde::{Deserialize, Serialize};

/// One worktree of a project, as the Worktrees panel lists it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeRow {
    pub path: String,
    /// `None` when the checkout is on a detached HEAD.
    pub branch: Option<String>,
    /// The task that owns the checkout; `None` for an orphan.
    pub task_id: Option<String>,
    pub task_title: Option<String>,
    pub orphan: bool,
    /// Bytes on disk; `None` while unknown because measuring timed out.
    pub size_bytes: Option<u64>,
    /// Whether a setup command left output for this task's worktree.
    pub has_setup_log: bool,
}
