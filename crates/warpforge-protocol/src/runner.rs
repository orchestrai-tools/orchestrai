//! The backlog runner ("Factory", ADR 0023): per-project settings, the queue of
//! backlog items waiting to run, and one metrics row per attempt.

use serde::{Deserialize, Serialize};

pub const DEFAULT_RUNNER_WORKFLOW: &str = "review-loop";
pub const DEFAULT_RUNNER_MAX_CONCURRENT: u32 = 1;
pub const DEFAULT_RUNNER_MAX_OPEN_PRS: u32 = 3;
pub const DEFAULT_RUNNER_MAX_PER_DAY: u32 = 10;
pub const DEFAULT_RUNNER_HEADROOM_PCT: u32 = 80;
pub const DEFAULT_RUNNER_MIN_FREE_GB: u32 = 25;

fn default_workflow() -> String {
    DEFAULT_RUNNER_WORKFLOW.to_string()
}
fn default_max_concurrent() -> u32 {
    DEFAULT_RUNNER_MAX_CONCURRENT
}
fn default_max_open_prs() -> u32 {
    DEFAULT_RUNNER_MAX_OPEN_PRS
}
fn default_max_per_day() -> u32 {
    DEFAULT_RUNNER_MAX_PER_DAY
}
fn default_headroom_pct() -> u32 {
    DEFAULT_RUNNER_HEADROOM_PCT
}
fn default_min_free_gb() -> u32 {
    DEFAULT_RUNNER_MIN_FREE_GB
}

/// How one project's runner works. Stored per project; a project that never
/// saved any gets [`RunnerSettings::defaults`], paused.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerSettings {
    pub project: String,
    /// Whether the runner starts queued items. Pausing never stops a run in flight.
    #[serde(default)]
    pub running: bool,
    /// Workflow template every item runs through.
    #[serde(default = "default_workflow")]
    pub workflow: String,
    /// Lead agent: every stage the template does not pin runs on it. Empty
    /// means the first enabled agent.
    #[serde(default)]
    pub agent: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent: u32,
    /// Runner pull requests still open before dispatch waits for review.
    #[serde(default = "default_max_open_prs")]
    pub max_open_prs: u32,
    /// Items started in any 24 hours.
    #[serde(default = "default_max_per_day")]
    pub max_per_day: u32,
    /// A new item waits while any quota window of a stage agent is above this.
    #[serde(default = "default_headroom_pct")]
    pub headroom_pct: u32,
    /// A new item waits while the project's disk has less free space than this.
    #[serde(default = "default_min_free_gb")]
    pub min_free_gb: u32,
    #[serde(default)]
    pub updated_at: i64,
}

impl RunnerSettings {
    /// Settings of a project that never saved any.
    /// @param project the project name
    /// @returns paused settings with every default
    pub fn defaults(project: &str) -> Self {
        Self {
            project: project.to_string(),
            running: false,
            workflow: default_workflow(),
            agent: String::new(),
            model: None,
            max_concurrent: DEFAULT_RUNNER_MAX_CONCURRENT,
            max_open_prs: DEFAULT_RUNNER_MAX_OPEN_PRS,
            max_per_day: DEFAULT_RUNNER_MAX_PER_DAY,
            headroom_pct: DEFAULT_RUNNER_HEADROOM_PCT,
            min_free_gb: DEFAULT_RUNNER_MIN_FREE_GB,
            updated_at: 0,
        }
    }
}

/// A settings edit; absent fields are left alone. An empty `model` clears it.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerSettingsPatch {
    #[serde(default)]
    pub running: Option<bool>,
    #[serde(default)]
    pub workflow: Option<String>,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub max_concurrent: Option<u32>,
    #[serde(default)]
    pub max_open_prs: Option<u32>,
    #[serde(default)]
    pub max_per_day: Option<u32>,
    #[serde(default)]
    pub headroom_pct: Option<u32>,
    #[serde(default)]
    pub min_free_gb: Option<u32>,
}

/// Where a queued item is. An entry leaves the queue when its run ends or its
/// pull request merges or closes; the attempt stays in [`ItemRun`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunnerEntryState {
    Queued,
    /// Its pipeline is running, or waiting at a barrier.
    Running,
    /// The pipeline succeeded; the change is being committed and pushed.
    Delivering,
    /// A draft pull request is open and waits for review.
    Delivered,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerEntry {
    /// The backlog item's id; one entry per item.
    pub item_id: String,
    pub project: String,
    /// Item number, title and priority as of the last read, for display and order.
    pub number: u64,
    pub title: String,
    #[serde(default)]
    pub priority: String,
    /// Manual order among queued entries of the same priority.
    pub position: u64,
    pub enqueued_at: i64,
    pub state: RunnerEntryState,
    /// Per-item overrides of the project settings.
    #[serde(default)]
    pub workflow: Option<String>,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub model: Option<String>,
    /// The pipeline task, once dispatched.
    #[serde(default)]
    pub task_id: Option<String>,
    /// The attempt in flight.
    #[serde(default)]
    pub run_id: Option<String>,
    #[serde(default)]
    pub pr_url: Option<String>,
    #[serde(default)]
    pub pr_number: Option<u64>,
    /// Why a queued entry is not starting yet.
    #[serde(default)]
    pub waiting_reason: Option<String>,
    #[serde(default)]
    pub updated_at: i64,
}

/// How an attempt ended, or where it is while it runs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemRunOutcome {
    Running,
    Delivering,
    /// A draft pull request is open.
    Delivered,
    Merged,
    /// The pull request was closed without merging.
    Rejected,
    /// The pipeline succeeded but changed nothing.
    NoChanges,
    /// The review rounds ran out with findings open.
    LimitHit,
    Stopped,
    Failed,
    /// Commit, push or opening the pull request failed.
    DeliveryFailed,
    /// The pipeline task was deleted.
    TaskDeleted,
}

impl ItemRunOutcome {
    /// Whether the attempt is over.
    /// @returns true for every outcome after which nothing changes
    pub fn is_final(self) -> bool {
        !matches!(self, Self::Running | Self::Delivering | Self::Delivered)
    }
}

/// One attempt of one item: the runner's metrics fact table, written at every
/// transition and never rebuilt from transcripts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemRun {
    pub id: String,
    pub project: String,
    pub item_id: String,
    pub item_number: u64,
    pub item_title: String,
    #[serde(default)]
    pub task_id: Option<String>,
    pub workflow: String,
    pub agent: String,
    #[serde(default)]
    pub model: Option<String>,
    pub enqueued_at: i64,
    pub dispatched_at: i64,
    /// When the pipeline ended.
    #[serde(default)]
    pub finished_at: Option<i64>,
    #[serde(default)]
    pub pr_opened_at: Option<i64>,
    #[serde(default)]
    pub merged_at: Option<i64>,
    /// When the pull request was closed without merging.
    #[serde(default)]
    pub closed_at: Option<i64>,
    /// Review rounds used.
    #[serde(default)]
    pub rounds: u32,
    /// Fix stages run.
    #[serde(default)]
    pub fix_rounds: u32,
    /// USD reported by the stage agents; `None` when none reported cost.
    #[serde(default)]
    pub cost_usd: Option<f64>,
    pub outcome: ItemRunOutcome,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub pr_url: Option<String>,
    #[serde(default)]
    pub pr_number: Option<u64>,
}

/// One project's runner as the Factory surface shows it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerStatus {
    pub settings: RunnerSettings,
    /// Queued entries in dispatch order, then the in-flight and delivered ones.
    pub entries: Vec<RunnerEntry>,
    /// Items started in the last 24 hours.
    pub dispatched_today: u32,
    /// Why no queued item starts right now, when something holds them all.
    #[serde(default)]
    pub hold: Option<String>,
}

#[cfg(test)]
mod tests {
    use crate::{Method, RunnerSettings, RunnerStatus};

    #[test]
    fn the_desktop_request_shapes_parse() {
        let enqueue: Method = serde_json::from_value(serde_json::json!({
            "method": "runner.enqueue",
            "params": { "project": "demo", "item_ids": ["b_1", "b_2"] }
        }))
        .unwrap();
        assert!(
            matches!(enqueue, Method::RunnerEnqueue { item_ids, origin_task: None, .. } if item_ids.len() == 2)
        );
        let settings: Method = serde_json::from_value(serde_json::json!({
            "method": "runner.updateSettings",
            "params": { "project": "demo", "patch": { "running": true, "maxOpenPrs": 2, "model": "" } }
        }))
        .unwrap();
        let Method::RunnerUpdateSettings { patch, .. } = settings else {
            panic!("not a settings update");
        };
        assert_eq!((patch.running, patch.max_open_prs), (Some(true), Some(2)));
        assert_eq!(patch.model.as_deref(), Some(""));
    }

    #[test]
    fn a_status_reads_back_with_defaults_for_missing_settings() {
        let status = RunnerStatus {
            settings: RunnerSettings::defaults("demo"),
            entries: Vec::new(),
            dispatched_today: 0,
            hold: None,
        };
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["settings"]["maxOpenPrs"], 3);
        let sparse: RunnerSettings =
            serde_json::from_value(serde_json::json!({ "project": "demo" })).unwrap();
        assert_eq!(sparse, RunnerSettings::defaults("demo"));
    }
}
