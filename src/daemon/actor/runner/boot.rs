//! Loading the runner at spawn, and reconciling it with the tasks and
//! pipelines the daemon restored.

use std::sync::{Arc, Mutex};

use warpforge_protocol as wire;

use super::{now_secs, RunnerState};
use crate::daemon::actor::Daemon;
use crate::daemon::runner::DAY_SECS;
use crate::daemon::store::Store;

/// Read the runner's rows once, while startup still owns the connection.
/// @param store the daemon's store, when it opened
/// @returns the mirror the actor starts with
pub(crate) fn load_state(store: Option<&Arc<Mutex<Store>>>) -> RunnerState {
    let Some(Ok(store)) = store.map(|s| s.lock()) else {
        return RunnerState::new(Vec::new(), Vec::new(), Vec::new(), Vec::new());
    };
    let settings = store.load_runner_settings().unwrap_or_default();
    let entries: Vec<wire::RunnerEntry> = store.load_runner_queue().unwrap_or_default();
    let runs = entries
        .iter()
        .filter_map(|e| e.run_id.as_deref())
        .filter_map(|id| store.load_item_run(id).ok().flatten())
        .filter(|run| !run.outcome.is_final())
        .collect();
    let dispatches = store
        .item_run_dispatches_since(now_secs() - DAY_SECS)
        .unwrap_or_default();
    RunnerState::new(settings, entries, runs, dispatches)
}

impl Daemon {
    /// After the workflow runs are restored: finish what ended while the
    /// daemon was down, resume interrupted deliveries, and follow every open
    /// pull request again.
    pub(crate) fn runner_restore(&mut self) {
        self.runner_sweep();
        let delivered: Vec<String> = self
            .runner
            .entries
            .values()
            .filter(|e| e.state == wire::RunnerEntryState::Delivered)
            .filter_map(|e| e.task_id.clone())
            .collect();
        for task_id in delivered {
            self.runner_watch(task_id);
        }
    }
}
