//! Why a Factory task is queued rather than running, and what a request to
//! start Factory tasks actually did. Structured so every client words the
//! reason itself (ADR 0023, *Factory as a task mode*).

use serde::{Deserialize, Serialize};

use crate::{EntryRunLocation, RunnerStatus};

/// What keeps a queued Factory task from starting. On [`crate::RunnerStatus`]
/// it holds every queued task of the project; on [`crate::RunnerEntry`] only
/// that one.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum RunnerWait {
    /// Every slot is taken by a running task.
    Slots { in_use: u32, limit: u32 },
    /// Draft pull requests the Factory opened wait for review.
    OpenPrs { open: u32, limit: u32 },
    /// The day's allowance is used; `next_at` is when the oldest start ages out.
    Daily {
        started: u32,
        limit: u32,
        #[serde(default)]
        next_at: Option<i64>,
    },
    /// An agent the pipeline starts is near or out of its quota.
    Quota {
        agent: String,
        #[serde(default)]
        account: Option<String>,
        #[serde(default)]
        window: Option<String>,
        #[serde(default)]
        used_pct: Option<u32>,
        #[serde(default)]
        limit_pct: Option<u32>,
        #[serde(default)]
        resets_at: Option<i64>,
    },
    /// Less free disk than the project's floor.
    Disk { free_gb: u64, min_gb: u32 },
    /// The project folder cannot take this task right now.
    CheckoutBusy {
        cause: CheckoutBusyCause,
        #[serde(default)]
        detail: Option<String>,
    },
    /// The Factory could not give the project folder back after a task; a
    /// person has to clean it up first.
    CheckoutHeld {
        reason: String,
        #[serde(default)]
        task_id: Option<String>,
    },
    /// The task's workflow template is missing or does not parse.
    WorkflowInvalid { workflow: String, error: String },
    /// Anything else, in words: an unreadable backlog item, no agent set up.
    Other { detail: String },
}

/// Why the project folder cannot take a Factory task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CheckoutBusyCause {
    /// Uncommitted or untracked changes.
    Dirty,
    /// A merge, rebase, cherry-pick, revert or bisect is in progress.
    Operation,
    /// A task outside the Factory is running there.
    TaskRunning,
    /// Another Factory task is using it.
    InUse,
    /// The backlog is stored in the project folder as YAML.
    YamlBacklog,
    /// Anything the inspection reported in words.
    Other,
}

/// Starting Factory tasks from backlog items: the shared configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactoryConfig {
    #[serde(default)]
    pub workflow: Option<String>,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub run_location: EntryRunLocation,
    /// Open a draft pull request when the run succeeds.
    #[serde(default = "yes")]
    pub deliver: bool,
}

fn yes() -> bool {
    true
}

impl Default for FactoryConfig {
    fn default() -> Self {
        Self {
            workflow: None,
            agent: None,
            model: None,
            run_location: EntryRunLocation::Default,
            deliver: true,
        }
    }
}

/// How `task.create` makes a Factory task scheduled by the daemon rather
/// than a workflow that starts on the spot.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FactoryCreate {
    /// Open a draft pull request when the run succeeds.
    #[serde(default)]
    pub deliver: bool,
    #[serde(default)]
    pub run_location: EntryRunLocation,
}

/// Why a backlog item did not become a Factory task.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum SkipReason {
    /// A Factory task for the item is already queued, running or in review.
    AlreadyInFactory {
        #[serde(default)]
        task_id: Option<String>,
    },
    /// The item is done or cancelled.
    Closed {
        status: String,
    },
    NotFound,
    Unreadable {
        detail: String,
    },
}

/// One item a start request left alone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedItem {
    pub item_id: String,
    #[serde(default)]
    pub number: u64,
    pub reason: SkipReason,
}

/// One Factory task a start request created.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedFactoryTask {
    pub task_id: String,
    #[serde(default)]
    pub item_id: Option<String>,
    /// Whether it started at once; otherwise it is queued.
    pub started: bool,
}

/// What `runner.enqueue` and `runner.retry` did, item by item.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnqueueResult {
    pub created: Vec<CreatedFactoryTask>,
    pub skipped: Vec<SkippedItem>,
    pub status: RunnerStatus,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_wait_names_its_kind_and_camel_cases_its_fields() {
        let wait = RunnerWait::OpenPrs { open: 3, limit: 3 };
        assert_eq!(
            serde_json::to_value(&wait).unwrap(),
            serde_json::json!({ "kind": "open_prs", "open": 3, "limit": 3 })
        );
        let quota: RunnerWait = serde_json::from_value(serde_json::json!({
            "kind": "quota", "agent": "claude", "resetsAt": 5
        }))
        .unwrap();
        assert!(matches!(
            quota,
            RunnerWait::Quota {
                resets_at: Some(5),
                ..
            }
        ));
        let busy = RunnerWait::CheckoutBusy {
            cause: CheckoutBusyCause::Dirty,
            detail: None,
        };
        assert_eq!(serde_json::to_value(&busy).unwrap()["cause"], "dirty");
    }

    #[test]
    fn a_skip_reason_carries_its_task() {
        let skip = SkipReason::AlreadyInFactory {
            task_id: Some("t1".into()),
        };
        assert_eq!(
            serde_json::to_value(&skip).unwrap(),
            serde_json::json!({ "kind": "already_in_factory", "taskId": "t1" })
        );
    }
}
