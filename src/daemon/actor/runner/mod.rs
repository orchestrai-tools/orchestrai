//! The Factory's actor glue (ADR 0023): the mirror of the Factory tasks it
//! schedules, starting their pipelines, delivery as a draft pull request, and
//! the pull request outcome that closes the item. Pure logic lives in
//! `daemon/runner/`.

mod boot;
mod checkout;
mod command;
mod deliver;
mod dispatch;
mod finish;
mod items;
mod pulls;
mod queue;
mod report;
mod retry;
mod start;
mod stop;
mod tasks;

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
pub use tasks::NewFactoryTask;

pub(crate) fn now_secs() -> i64 {
    chrono::Utc::now().timestamp()
}

/// The runner's in-memory mirror. Authoritative: every read goes here, and
/// every write lands here before its store write is queued (ADR 0007).
pub(crate) struct RunnerState {
    settings: HashMap<String, wire::RunnerSettings>,
    /// Entries by Factory task id.
    entries: HashMap<String, wire::RunnerEntry>,
    /// Attempts not yet final, plus final ones still waiting for their cost.
    runs: HashMap<String, wire::ItemRun>,
    /// `(project, dispatched_at)` of the attempts started in the last day.
    dispatches: Vec<(String, i64)>,
    /// Why nothing starts in a project right now, as last judged.
    holds: HashMap<String, wire::RunnerWait>,
    /// Tasks whose off-loop wrap-up is in flight.
    finishing: HashSet<String>,
    /// The Factory's hold on each project checkout, by project.
    leases: HashMap<String, wire::CheckoutLease>,
    /// Why the last checkout-mode start was refused, by project; cleared by
    /// the tick and by every request, so the check runs again.
    checkout_blocks: HashMap<String, wire::RunnerWait>,
    /// Tasks a person started now whose project folder is being prepared.
    forced: HashSet<String>,
    /// Stored entries still keyed by backlog item, rewritten at restore.
    legacy: Vec<(String, wire::RunnerEntry)>,
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
        leases: Vec<wire::CheckoutLease>,
    ) -> Self {
        Self {
            settings: settings
                .into_iter()
                .map(|s| (s.project.clone(), s))
                .collect(),
            entries: entries
                .into_iter()
                .map(|e| (e.task_id.clone(), e))
                .collect(),
            runs: runs.into_iter().map(|r| (r.id.clone(), r)).collect(),
            dispatches,
            holds: HashMap::new(),
            finishing: HashSet::new(),
            leases: leases.into_iter().map(|l| (l.project.clone(), l)).collect(),
            checkout_blocks: HashMap::new(),
            forced: HashSet::new(),
            legacy: Vec::new(),
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
                config,
                origin_task,
                reply,
            } => {
                let result = self
                    .runner_enqueue(&project, &item_ids, config, origin_task.as_deref())
                    .await;
                let _ = reply.send(result);
            }
            RunnerCommand::CreateTask { task, reply } => {
                let result = self.runner_create_from_dialog(*task).await;
                let _ = reply.send(result);
            }
            RunnerCommand::Dequeue {
                project,
                task_id,
                reply,
            } => {
                let result = self.runner_dequeue(&project, &task_id);
                let _ = reply.send(result.map(|()| self.runner_status(&project)));
            }
            RunnerCommand::Reorder {
                project,
                task_ids,
                reply,
            } => {
                let result = self.runner_reorder(&project, &task_ids);
                let _ = reply.send(result.map(|()| self.runner_status(&project)));
            }
            RunnerCommand::StartNow {
                project,
                task_id,
                reply,
            } => {
                let result = self.runner_start_now(&project, &task_id).await;
                let _ = reply.send(result.map(|()| self.runner_status(&project)));
            }
            RunnerCommand::Retry { task_id, reply } => {
                let result = self.runner_retry(&task_id).await;
                let _ = reply.send(result);
            }
            RunnerCommand::RetryCheckout { project, reply } => {
                let result = self.runner_require_project(&project).map(|()| {
                    self.runner.checkout_blocks.remove(&project);
                    self.runner_checkout_retry(&project);
                });
                let _ = reply.send(result.map(|()| self.runner_status(&project)));
            }
            RunnerCommand::Brief {
                project,
                item_id,
                reply,
            } => {
                let result = match self.runner_read_item(&project, &item_id) {
                    Ok(Some(item)) => Ok(crate::daemon::runner::brief_body(&item)),
                    Ok(None) => Err(format!("no backlog item {item_id} in '{project}'")),
                    Err(error) => Err(format!("{error:#}")),
                };
                let _ = reply.send(result);
            }
            RunnerCommand::UpdateSettings {
                project,
                patch,
                reply,
            } => {
                let result = self.runner_update_settings(&project, patch);
                if result.is_ok() {
                    self.runner.checkout_blocks.remove(&project);
                    self.runner_dispatch(&project).await;
                }
                let _ = reply.send(result.map(|()| self.runner_status(&project)));
            }
            RunnerCommand::Stop { project, reply } => {
                let result = self.runner_stop(&project).await;
                let _ = reply.send(result.map(|()| self.runner_status(&project)));
            }
            RunnerCommand::CheckoutInspected {
                project,
                task_id,
                result,
            } => {
                self.runner_checkout_inspected(&project, &task_id, result)
                    .await
            }
            RunnerCommand::CheckoutSwitched {
                project,
                task_id,
                result,
            } => {
                self.runner_checkout_switched(&project, &task_id, result)
                    .await
            }
            RunnerCommand::CheckoutReturned {
                project,
                task_id,
                result,
            } => {
                self.runner_checkout_returned(&project, &task_id, result)
                    .await
            }
            RunnerCommand::Runs {
                project,
                limit,
                reply,
            } => self.runner_runs(project, limit, reply),
            RunnerCommand::Tick => self.runner_tick().await,
            RunnerCommand::Dispatch { project } => self.runner_dispatch(&project).await,
            RunnerCommand::Finished {
                task_id,
                run_id,
                cost_usd,
                delivery,
            } => {
                self.runner_finished(&task_id, &run_id, cost_usd, delivery)
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

    /// When the oldest start of the last 24 hours happened in `project`.
    fn runner_oldest_today(&self, project: &str, now: i64) -> Option<i64> {
        let since = now - crate::daemon::runner::DAY_SECS;
        self.runner
            .dispatches
            .iter()
            .filter(|(p, at)| p == project && *at > since)
            .map(|(_, at)| *at)
            .min()
    }

    /// One project's Factory as clients show it.
    /// @param project the project name
    /// @returns settings, entries in start order, then the rest by age
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
            entries: queued
                .into_iter()
                .chain(active)
                .map(|entry| wire::RunnerEntry {
                    attachments: Vec::new(),
                    ..entry.clone()
                })
                .collect(),
            dispatched_today: self.runner_dispatched_today(project, now_secs()),
            hold: self
                .runner
                .leases
                .get(project)
                .filter(|l| l.state == wire::CheckoutLeaseState::Held)
                .and_then(|_| self.runner_lease_hold(project))
                .or_else(|| self.runner.holds.get(project).cloned()),
            checkout: self.runner.leases.get(project).cloned(),
        }
    }

    fn runner_emit(&self, project: &str) {
        self.emit(Event::RunnerUpdated(Box::new(self.runner_status(project))));
    }

    /// Write an entry through: mirror first, then the store queue. An entry
    /// leaving its run gives back the project checkout it held.
    fn runner_put_entry(&mut self, mut entry: wire::RunnerEntry) {
        entry.updated_at = now_secs();
        self.persist
            .write(PersistWrite::RunnerEntry(Box::new(entry.clone())));
        let task_id = entry.task_id.clone();
        let in_run = matches!(
            entry.state,
            wire::RunnerEntryState::Running | wire::RunnerEntryState::Delivering
        );
        self.runner.entries.insert(task_id.clone(), entry);
        if !in_run {
            self.runner_checkout_entry_left(&task_id);
        }
    }

    fn runner_drop_entry(&mut self, task_id: &str) {
        self.runner.entries.remove(task_id);
        self.persist
            .write(PersistWrite::RunnerDequeue(task_id.to_string()));
        self.runner_checkout_entry_left(task_id);
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

    /// Items the Factory has started and not yet let go of. A tracker sync
    /// keeps their local status, which the Factory writes (ADR 0023).
    pub(crate) fn runner_active_items(&self) -> HashSet<String> {
        self.runner
            .entries
            .values()
            .filter(|e| e.state != wire::RunnerEntryState::Queued)
            .filter_map(|e| e.item_id.clone())
            .collect()
    }

    /// Whether `task_id` is a Factory task that opens a pull request.
    pub(crate) fn runner_delivers(&self, task_id: &str) -> bool {
        self.runner.entries.get(task_id).is_some_and(|e| e.deliver)
    }

    /// Whether `task_id` is a Factory task the daemon schedules.
    pub(crate) fn runner_has_task(&self, task_id: &str) -> bool {
        self.runner.entries.contains_key(task_id)
    }

    /// Whether `task_id` waits in the Factory queue: it has no session yet,
    /// and a restart keeps it waiting.
    pub(crate) fn runner_is_queued(&self, task_id: &str) -> bool {
        self.runner
            .entries
            .get(task_id)
            .is_some_and(|e| e.state == wire::RunnerEntryState::Queued)
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
