//! The backlog runner's actor glue (ADR 0023): the queue mirror, dispatch into
//! workflow pipelines, delivery as a draft pull request, and the pull request
//! outcome that closes the item. Pure logic lives in `daemon/runner/`.

mod boot;
mod command;
mod deliver;
mod dispatch;
mod finish;
mod items;
mod pulls;
mod queue;

use std::collections::{HashMap, HashSet};

use tokio::sync::mpsc;

use warpforge_protocol as wire;

use crate::daemon::actor::{Daemon, Event};
use crate::daemon::runtime::Write as PersistWrite;

pub(crate) use boot::load_state;
pub use command::RunnerCommand;
#[cfg(test)]
pub(crate) use deliver::PrOpener;
pub(crate) use pulls::spawn_pull_bridge;

pub(crate) fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

/// The runner's in-memory mirror. Authoritative: every read goes here, and
/// every write lands here before its store write is queued (ADR 0007).
pub(crate) struct RunnerState {
    settings: HashMap<String, wire::RunnerSettings>,
    /// Queue entries by backlog item id.
    entries: HashMap<String, wire::RunnerEntry>,
    /// Attempts not yet final, plus final ones still waiting for their cost.
    runs: HashMap<String, wire::ItemRun>,
    /// `(project, dispatched_at)` of the attempts started in the last day.
    dispatches: Vec<(String, i64)>,
    /// Why nothing starts in a project right now, as last judged.
    holds: HashMap<String, String>,
    /// Items whose off-loop wrap-up is in flight.
    finishing: HashSet<String>,
    /// Task ids for the pull request bridge to watch.
    watch_tx: Option<mpsc::UnboundedSender<String>>,
    open_pr: deliver::PrOpener,
}

impl RunnerState {
    fn new(
        settings: Vec<wire::RunnerSettings>,
        entries: Vec<wire::RunnerEntry>,
        runs: Vec<wire::ItemRun>,
        dispatches: Vec<(String, i64)>,
    ) -> Self {
        Self {
            settings: settings
                .into_iter()
                .map(|s| (s.project.clone(), s))
                .collect(),
            entries: entries
                .into_iter()
                .map(|e| (e.item_id.clone(), e))
                .collect(),
            runs: runs.into_iter().map(|r| (r.id.clone(), r)).collect(),
            dispatches,
            holds: HashMap::new(),
            finishing: HashSet::new(),
            watch_tx: None,
            open_pr: deliver::default_opener(),
        }
    }

    /// Hand the state the channel its pull request bridge reads.
    /// @param tx the bridge's task id channel
    pub(crate) fn set_watch(&mut self, tx: mpsc::UnboundedSender<String>) {
        self.watch_tx = Some(tx);
    }
}

impl Daemon {
    pub(crate) async fn handle_runner_command(&mut self, cmd: RunnerCommand) {
        match cmd {
            RunnerCommand::Status { project, reply } => {
                let result = self
                    .runner_require_project(&project)
                    .map(|()| self.runner_status(&project));
                let _ = reply.send(result);
            }
            RunnerCommand::Enqueue {
                project,
                item_ids,
                workflow,
                agent,
                model,
                origin_task,
                reply,
            } => {
                let overrides = queue::Overrides {
                    workflow,
                    agent,
                    model,
                };
                let result =
                    self.runner_enqueue(&project, &item_ids, overrides, origin_task.as_deref());
                if result.is_ok() {
                    self.runner_dispatch(&project).await;
                }
                let _ = reply.send(result.map(|()| self.runner_status(&project)));
            }
            RunnerCommand::Dequeue {
                project,
                item_id,
                reply,
            } => {
                let result = self.runner_dequeue(&project, &item_id);
                let _ = reply.send(result.map(|()| self.runner_status(&project)));
            }
            RunnerCommand::Reorder {
                project,
                item_ids,
                reply,
            } => {
                let result = self.runner_reorder(&project, &item_ids);
                let _ = reply.send(result.map(|()| self.runner_status(&project)));
            }
            RunnerCommand::UpdateSettings {
                project,
                patch,
                reply,
            } => {
                let result = self.runner_update_settings(&project, patch);
                if result.is_ok() {
                    self.runner_dispatch(&project).await;
                }
                let _ = reply.send(result.map(|()| self.runner_status(&project)));
            }
            RunnerCommand::Runs {
                project,
                limit,
                reply,
            } => self.runner_runs(project, limit, reply),
            RunnerCommand::Tick => self.runner_tick().await,
            RunnerCommand::Dispatch { project } => self.runner_dispatch(&project).await,
            RunnerCommand::Finished {
                item_id,
                run_id,
                cost_usd,
                delivery,
            } => {
                self.runner_finished(&item_id, &run_id, cost_usd, delivery)
                    .await
            }
            RunnerCommand::PullSettled { task_id, pull } => {
                self.runner_pull_settled(&task_id, pull).await
            }
            #[cfg(test)]
            RunnerCommand::SetPrOpener(opener) => self.runner.open_pr = opener,
        }
    }

    fn runner_require_project(&self, project: &str) -> Result<(), String> {
        self.project_path(project)
            .map(|_| ())
            .ok_or_else(|| format!("unknown project '{project}'"))
    }

    fn runner_settings(&self, project: &str) -> wire::RunnerSettings {
        self.runner
            .settings
            .get(project)
            .cloned()
            .unwrap_or_else(|| wire::RunnerSettings::defaults(project))
    }

    fn runner_dispatched_today(&self, project: &str, now: i64) -> u32 {
        let since = now - crate::daemon::runner::DAY_SECS;
        self.runner
            .dispatches
            .iter()
            .filter(|(p, at)| p == project && *at > since)
            .count() as u32
    }

    /// One project's runner as the Factory surface shows it.
    /// @param project the project name
    /// @returns settings, entries in dispatch order, then the rest by age
    pub(crate) fn runner_status(&self, project: &str) -> wire::RunnerStatus {
        let queued = crate::daemon::runner::dispatch_order(self.runner.entries.values(), project);
        let mut active: Vec<&wire::RunnerEntry> = self
            .runner
            .entries
            .values()
            .filter(|e| e.project == project && e.state != wire::RunnerEntryState::Queued)
            .collect();
        active.sort_by_key(|e| std::cmp::Reverse(e.updated_at));
        wire::RunnerStatus {
            settings: self.runner_settings(project),
            entries: queued.into_iter().chain(active).cloned().collect(),
            dispatched_today: self.runner_dispatched_today(project, now_secs()),
            hold: self.runner.holds.get(project).cloned(),
        }
    }

    fn runner_emit(&self, project: &str) {
        self.emit(Event::RunnerUpdated(Box::new(self.runner_status(project))));
    }

    /// Write an entry through: mirror first, then the store queue.
    fn runner_put_entry(&mut self, mut entry: wire::RunnerEntry) {
        entry.updated_at = now_secs();
        self.persist
            .write(PersistWrite::RunnerEntry(Box::new(entry.clone())));
        self.runner.entries.insert(entry.item_id.clone(), entry);
    }

    fn runner_drop_entry(&mut self, item_id: &str) {
        self.runner.entries.remove(item_id);
        self.persist
            .write(PersistWrite::RunnerDequeue(item_id.to_string()));
    }

    /// Write an attempt through and tell clients. A final attempt leaves the
    /// mirror unless it still waits for its cost.
    fn runner_put_run(&mut self, run: wire::ItemRun, keep: bool) {
        self.persist
            .write(PersistWrite::ItemRun(Box::new(run.clone())));
        self.emit(Event::RunnerRunUpdated(Box::new(run.clone())));
        if run.outcome.is_final() && !keep {
            self.runner.runs.remove(&run.id);
        } else {
            self.runner.runs.insert(run.id.clone(), run);
        }
    }

    /// The entry whose pipeline is `task_id`.
    fn runner_entry_of_task(&self, task_id: &str) -> Option<String> {
        self.runner
            .entries
            .values()
            .find(|e| e.task_id.as_deref() == Some(task_id))
            .map(|e| e.item_id.clone())
    }

    fn runner_runs(
        &self,
        project: String,
        limit: Option<u32>,
        reply: tokio::sync::oneshot::Sender<Result<Vec<wire::ItemRun>, String>>,
    ) {
        let persist = self.persist.clone();
        let store = self.store.clone();
        let limit = limit.unwrap_or(25).clamp(1, 200);
        tokio::spawn(async move {
            persist.flush().await;
            let result = crate::daemon::runtime::store_read(store, move |store| {
                store
                    .load_item_runs(&project, limit)
                    .map_err(|e| format!("{e:#}"))
            })
            .await
            .unwrap_or_else(|| Err("daemon has no persistent store".into()));
            let _ = reply.send(result);
        });
    }
}

#[cfg(test)]
mod tests;
