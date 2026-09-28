//! Pull-request state of worktree tasks, for the sidebar row and the task
//! header. A cache refreshed through `gh` on spawned tasks, never on the actor
//! loop; changes go out as `task.pullRequest` (docs/adr/0020).

mod gh;
mod removal;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::Result;
use tokio::sync::{broadcast, mpsc, oneshot, Semaphore};
use warpforge_protocol as wire;

use crate::daemon::actor::{Command, DaemonHandle, Event};
use crate::daemon::task::Task;

pub(crate) use removal::removal_blocker;

/// How often open pull requests are re-checked once a client has asked.
const POLL_INTERVAL: Duration = Duration::from_secs(180);
/// Staleness a client refresh tolerates unless it names its own.
const DEFAULT_MAX_AGE: Duration = Duration::from_secs(120);
const MAX_CONCURRENT_FETCHES: usize = 4;

/// Where to look for a task's pull request.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct PullTarget {
    pub worktree: String,
    pub base_branch: Option<String>,
}

type FetchFuture = Pin<Box<dyn Future<Output = Result<Option<wire::TaskPullRequest>>> + Send>>;
pub(crate) type Fetcher = Arc<dyn Fn(PullTarget) -> FetchFuture + Send + Sync>;

struct Entry {
    target: PullTarget,
    pull: Option<wire::TaskPullRequest>,
    checked_at: Option<Instant>,
    in_flight: bool,
    again: bool,
}

pub struct PullWatch {
    fetch: Fetcher,
    entries: Mutex<HashMap<String, Entry>>,
    permits: Semaphore,
    polling: AtomicBool,
}

impl Default for PullWatch {
    fn default() -> Self {
        #[cfg(not(test))]
        let fetch: Fetcher = Arc::new(|target| Box::pin(gh::fetch(target)));
        #[cfg(test)]
        let fetch: Fetcher = Arc::new(|_| Box::pin(async { Ok(None) }));
        Self::new(fetch)
    }
}

impl PullWatch {
    pub(crate) fn new(fetch: Fetcher) -> Self {
        Self {
            fetch,
            entries: Mutex::new(HashMap::new()),
            permits: Semaphore::new(MAX_CONCURRENT_FETCHES),
            polling: AtomicBool::new(false),
        }
    }

    /// Re-check the tasks in `only` (all of `targets` when `None`) whose state
    /// is older than `max_age`, and drop entries whose task is gone or moved.
    /// Returns the cache as it stands; fetch results arrive as events.
    pub(crate) fn refresh(
        self: &Arc<Self>,
        targets: HashMap<String, PullTarget>,
        only: Option<&[String]>,
        max_age: Duration,
        events: &broadcast::Sender<Event>,
    ) -> HashMap<String, wire::TaskPullRequest> {
        let now = Instant::now();
        let mut due = Vec::new();
        let mut entries = self.entries.lock().unwrap();
        entries.retain(|id, entry| {
            let keep = targets.get(id) == Some(&entry.target);
            if !keep && entry.pull.is_some() {
                emit(events, id, None);
            }
            keep
        });
        for (id, target) in &targets {
            if only.is_some_and(|ids| !ids.contains(id)) {
                continue;
            }
            let entry = entries.entry(id.clone()).or_insert_with(|| Entry {
                target: target.clone(),
                pull: None,
                checked_at: None,
                in_flight: false,
                again: false,
            });
            if entry
                .checked_at
                .is_some_and(|at| now.duration_since(at) < max_age)
            {
                continue;
            }
            if entry.in_flight {
                entry.again |= max_age.is_zero();
                continue;
            }
            entry.in_flight = true;
            due.push((id.clone(), target.clone()));
        }
        let cached = cached(&entries);
        drop(entries);
        for (id, target) in due {
            self.spawn_fetch(id, target, events.clone());
        }
        cached
    }

    /// Forget a task whose checkout is going away, clearing it on clients.
    pub(crate) fn forget(&self, task_id: &str, events: &broadcast::Sender<Event>) {
        let removed = self.entries.lock().unwrap().remove(task_id);
        if removed.is_some_and(|entry| entry.pull.is_some()) {
            emit(events, task_id, None);
        }
    }

    /// Head commit of the task's pull request, when one is known.
    pub(crate) fn head_oid(&self, task_id: &str) -> Option<String> {
        let entries = self.entries.lock().unwrap();
        entries.get(task_id)?.pull.as_ref()?.head_oid.clone()
    }

    fn open_task_ids(&self) -> Vec<String> {
        self.entries
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, entry)| {
                entry.pull.as_ref().is_some_and(|pull| {
                    matches!(
                        pull.state,
                        wire::TaskPullState::Open | wire::TaskPullState::Draft
                    )
                })
            })
            .map(|(id, _)| id.clone())
            .collect()
    }

    fn spawn_fetch(
        self: &Arc<Self>,
        id: String,
        target: PullTarget,
        events: broadcast::Sender<Event>,
    ) {
        let watch = Arc::clone(self);
        tokio::spawn(async move {
            loop {
                let result = {
                    let _permit = watch.permits.acquire().await;
                    (watch.fetch)(target.clone()).await
                };
                if !watch.settle(&id, &target, result, &events) {
                    return;
                }
            }
        });
    }

    /// Record one fetch. A failure keeps the last known state: `gh` missing,
    /// signed out or offline must not flap a badge. Returns whether a forced
    /// refresh arrived meanwhile and the fetch should run again.
    fn settle(
        &self,
        id: &str,
        target: &PullTarget,
        result: Result<Option<wire::TaskPullRequest>>,
        events: &broadcast::Sender<Event>,
    ) -> bool {
        let mut entries = self.entries.lock().unwrap();
        let Some(entry) = entries.get_mut(id).filter(|entry| &entry.target == target) else {
            return false;
        };
        if let Ok(pull) = result {
            if entry.pull != pull {
                entry.pull = pull.clone();
                emit(events, id, pull);
            }
        }
        entry.checked_at = Some(Instant::now());
        if std::mem::take(&mut entry.again) {
            return true;
        }
        entry.in_flight = false;
        false
    }

    /// Start re-checking open pull requests every few minutes. Holds only a
    /// weak sender, so a dropped daemon ends the loop.
    fn ensure_polling(self: &Arc<Self>, handle: &DaemonHandle) {
        if self.polling.swap(true, Ordering::SeqCst) {
            return;
        }
        let watch = Arc::clone(self);
        let cmd_tx = handle.cmd_tx.downgrade();
        let events = handle.event_tx.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(POLL_INTERVAL);
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            tick.tick().await;
            loop {
                tick.tick().await;
                let Some(cmd_tx) = cmd_tx.upgrade() else {
                    return;
                };
                let open = watch.open_task_ids();
                if open.is_empty() {
                    continue;
                }
                let tasks = list_tasks(&cmd_tx).await;
                drop(cmd_tx);
                let max_age = POLL_INTERVAL - Duration::from_secs(30);
                watch.refresh(targets(&tasks), Some(&open), max_age, &events);
            }
        });
    }
}

/// Refresh through a daemon handle and start the background poll.
pub(crate) async fn refresh(
    handle: &DaemonHandle,
    only: Option<&[String]>,
    max_age_secs: Option<u64>,
) -> HashMap<String, wire::TaskPullRequest> {
    handle.pulls.ensure_polling(handle);
    let max_age = max_age_secs.map_or(DEFAULT_MAX_AGE, Duration::from_secs);
    let tasks = handle.tasks().await;
    handle
        .pulls
        .refresh(targets(&tasks), only, max_age, &handle.event_tx)
}

/// Every live task with an isolated checkout, keyed by task id. Archived
/// tasks sit folded on the sidebar's done shelf and are not worth a `gh` call.
pub(crate) fn targets(tasks: &[Task]) -> HashMap<String, PullTarget> {
    tasks
        .iter()
        .filter(|task| task.status != crate::daemon::task::TaskStatus::Done)
        .filter_map(|task| {
            let worktree = task.worktree.clone()?;
            Some((
                task.id.clone(),
                PullTarget {
                    worktree,
                    base_branch: task.base_branch.clone(),
                },
            ))
        })
        .collect()
}

async fn list_tasks(cmd_tx: &mpsc::Sender<Command>) -> Vec<Task> {
    let (tx, rx) = oneshot::channel();
    if cmd_tx.send(Command::Tasks(tx)).await.is_err() {
        return Vec::new();
    }
    rx.await.unwrap_or_default()
}

fn cached(entries: &HashMap<String, Entry>) -> HashMap<String, wire::TaskPullRequest> {
    entries
        .iter()
        .filter_map(|(id, entry)| Some((id.clone(), entry.pull.clone()?)))
        .collect()
}

fn emit(events: &broadcast::Sender<Event>, task_id: &str, pull: Option<wire::TaskPullRequest>) {
    let _ = events.send(Event::TaskPullRequest {
        task_id: task_id.to_string(),
        pull_request: pull,
    });
}
