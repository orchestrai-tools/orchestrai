//! Loading the Factory at spawn, and reconciling it with the tasks and
//! pipelines the daemon restored.

use std::sync::{Arc, Mutex};

use warpforge_protocol as wire;

use super::tasks::NewFactoryTask;
use super::{now_secs, RunnerState};
use crate::daemon::actor::{Daemon, Event};
use crate::daemon::runner::DAY_SECS;
use crate::daemon::runtime::Write as PersistWrite;
use crate::daemon::store::Store;
use crate::daemon::task::TaskStatus;

/// Read the Factory's rows once, while startup still owns the connection.
/// @param store the daemon's store, when it opened
/// @returns the mirror the actor starts with
pub(crate) fn load_state(store: Option<&Arc<Mutex<Store>>>) -> RunnerState {
    let Some(Ok(store)) = store.map(|s| s.lock()) else {
        return RunnerState::new(Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new());
    };
    let settings = store.load_runner_settings().unwrap_or_default();
    let rows = store.load_runner_queue().unwrap_or_default();
    let runs = rows
        .iter()
        .filter_map(|(_, e)| e.run_id.as_deref())
        .filter_map(|id| store.load_item_run(id).ok().flatten())
        .filter(|run| !run.outcome.is_final())
        .collect();
    let dispatches = store
        .item_run_dispatches_since(now_secs() - DAY_SECS)
        .unwrap_or_default();
    let leases = store.load_checkout_leases().unwrap_or_default();
    let (entries, legacy): (Vec<_>, Vec<_>) = rows
        .into_iter()
        .partition(|(key, e)| !e.task_id.is_empty() && *key == e.task_id);
    let mut state = RunnerState::new(
        settings,
        entries.into_iter().map(|(_, e)| e).collect(),
        runs,
        dispatches,
        leases,
    );
    state.legacy = legacy;
    state
}

impl Daemon {
    /// After the workflow runs are restored: move entries saved before tasks
    /// were the key, reconcile the checkout leases, finish what ended while
    /// the daemon was down, resume interrupted deliveries, keep queued tasks
    /// queued, and follow every open pull request again.
    pub(crate) fn runner_restore(&mut self) {
        self.runner_adopt_legacy();
        self.runner_checkout_restore();
        self.runner_sweep();
        self.runner_requeue_tasks();
        let delivered: Vec<String> = self
            .runner
            .entries
            .values()
            .filter(|e| e.state == wire::RunnerEntryState::Delivered)
            .map(|e| e.task_id.clone())
            .collect();
        for task_id in delivered {
            self.runner_watch(task_id);
        }
    }

    /// Rewrite each entry keyed by its backlog item under its task. A queued
    /// one never had a task, so it gets one now.
    fn runner_adopt_legacy(&mut self) {
        for (key, entry) in std::mem::take(&mut self.runner.legacy) {
            self.persist.write(PersistWrite::RunnerDequeue(key));
            if !entry.task_id.is_empty() {
                self.runner_put_entry(entry);
                continue;
            }
            let Some(item_id) = entry.item_id.clone() else {
                continue;
            };
            let item = match self.runner_read_item(&entry.project, &item_id) {
                Ok(Some(item)) => item,
                _ => continue,
            };
            let new = NewFactoryTask {
                project: entry.project.clone(),
                prompt: crate::daemon::runner::brief_body(&item),
                agent: entry.agent.clone(),
                model: entry.model.clone(),
                workflow: entry.workflow.clone(),
                item_id: Some(item_id),
                run_location: entry.run_location,
                deliver: true,
                ..NewFactoryTask::default()
            };
            if let Err(error) = self.runner_add_task(new, Some(&item)) {
                eprintln!("[runner] dropping queued #{}: {error}", item.number);
            }
        }
    }

    /// The store reads every queued task back as interrupted; a Factory task
    /// still waiting for a slot is queued, not lost.
    fn runner_requeue_tasks(&mut self) {
        let queued: Vec<String> = self
            .runner
            .entries
            .values()
            .filter(|e| e.state == wire::RunnerEntryState::Queued)
            .map(|e| e.task_id.clone())
            .collect();
        for task_id in queued {
            let Some(task) = self
                .tasks
                .get_mut(&task_id)
                .filter(|t| t.status == TaskStatus::Interrupted && t.session_id.is_none())
            else {
                continue;
            };
            task.status = TaskStatus::Queued;
            let updated = task.clone();
            self.persist(&updated);
            self.emit(Event::TaskUpdated(updated));
        }
    }
}
