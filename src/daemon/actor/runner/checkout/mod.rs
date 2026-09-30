//! Project-folder runs (ADR 0023, *Run location*): one Factory task at a time
//! in the project checkout. A task that opens a pull request runs on a task
//! branch the Factory creates; the lease records where to return the checkout
//! and survives a restart. The Factory switches branches only on a clean tree.
//! A task that opens no pull request runs in place, on whatever is checked out.

mod git;

use std::path::PathBuf;

use warpforge_protocol as wire;

pub use git::{GiveBack, ReturnPoint};

use super::{now_secs, RunnerCommand};
use crate::daemon::actor::{Command, Daemon, Event};
use crate::daemon::runtime::Write as PersistWrite;
use crate::daemon::task::TaskStatus;
use crate::daemon::worktree::TASK_BRANCH_PREFIX;

impl Daemon {
    fn runner_put_lease(&mut self, mut lease: wire::CheckoutLease) {
        lease.updated_at = now_secs();
        self.persist
            .write(PersistWrite::CheckoutLease(Box::new(lease.clone())));
        self.runner.leases.insert(lease.project.clone(), lease);
    }

    fn runner_drop_lease(&mut self, project: &str) {
        self.runner.leases.remove(project);
        self.persist
            .write(PersistWrite::CheckoutLeaseDrop(project.to_string()));
    }

    /// Why no project-folder task starts while the Factory holds `project`'s
    /// checkout.
    pub(super) fn runner_lease_hold(&self, project: &str) -> Option<wire::RunnerWait> {
        let lease = self.runner.leases.get(project)?;
        Some(match lease.state {
            wire::CheckoutLeaseState::Held => wire::RunnerWait::CheckoutHeld {
                reason: lease.held_reason.clone().unwrap_or_else(|| {
                    format!("The Factory left your project folder on {}", lease.branch)
                }),
                task_id: Some(lease.task_id.clone()),
            },
            _ => wire::RunnerWait::CheckoutBusy {
                cause: wire::CheckoutBusyCause::InUse,
                detail: None,
            },
        })
    }

    /// The whole project waits while a checkout is held: a person has to
    /// clean it up, and a worktree start would fetch into the same repo.
    pub(super) fn runner_held(&self, project: &str) -> Option<wire::RunnerWait> {
        self.runner
            .leases
            .get(project)
            .filter(|l| l.state == wire::CheckoutLeaseState::Held)
            .and_then(|_| self.runner_lease_hold(project))
    }

    /// Whether `task` or one of its ancestors is a Factory pipeline.
    fn runner_owns_task(&self, task: &crate::daemon::task::Task) -> bool {
        let mut current = Some(task);
        while let Some(task) = current {
            if task
                .tags
                .iter()
                .any(|t| t == crate::daemon::runner::RUNNER_TAG)
            {
                return true;
            }
            current = task
                .parent_task_id
                .as_deref()
                .and_then(|p| self.tasks.get(p));
        }
        false
    }

    /// Why a project-folder task cannot start in `project` now, judged on
    /// the loop; the git checks run when a leased run is prepared.
    /// @param leased whether the task needs the lease (it opens a pull request)
    pub(super) fn runner_checkout_refusal(
        &self,
        project: &str,
        leased: bool,
    ) -> Option<wire::RunnerWait> {
        use wire::CheckoutBusyCause as Cause;
        if let Some(hold) = self.runner_lease_hold(project) {
            return Some(hold);
        }
        let in_place = self.runner.entries.values().any(|e| {
            e.project == project
                && e.resolved_location == Some(wire::RunLocation::Checkout)
                && matches!(
                    e.state,
                    wire::RunnerEntryState::Running | wire::RunnerEntryState::Delivering
                )
        });
        if in_place {
            return Some(wire::RunnerWait::CheckoutBusy {
                cause: Cause::InUse,
                detail: None,
            });
        }
        if leased {
            let yaml = self
                .with_store(|store| store.backlog_storage_mode().ok())
                .flatten()
                == Some(wire::BacklogStorageMode::Yaml);
            if yaml {
                return Some(wire::RunnerWait::CheckoutBusy {
                    cause: Cause::YamlBacklog,
                    detail: None,
                });
            }
            if let Some(wait) = self.runner.checkout_blocks.get(project) {
                return Some(wait.clone());
            }
        }
        self.tasks
            .values()
            .filter(|t| {
                t.project == project && t.worktree.is_none() && t.status == TaskStatus::Running
            })
            .find(|t| !self.runner_owns_task(t))
            .map(|t| wire::RunnerWait::CheckoutBusy {
                cause: Cause::TaskRunning,
                detail: Some(t.title.clone()),
            })
    }

    /// The project checkout a checkout-mode pipeline `task_id` runs in.
    pub(super) fn runner_checkout_dir(&self, task_id: &str) -> Option<String> {
        let lease = self.runner.leases.values().find(|l| l.task_id == task_id)?;
        self.project_path(&lease.project)
    }

    /// Take the checkout for `entry` and inspect it off the loop.
    pub(super) fn runner_checkout_begin(&mut self, entry: &wire::RunnerEntry) {
        let task_id = entry.task_id.clone();
        let lease = wire::CheckoutLease {
            project: entry.project.clone(),
            item_id: entry.item_id.clone(),
            item_number: entry.number,
            branch: format!("{TASK_BRANCH_PREFIX}{task_id}"),
            task_id: task_id.clone(),
            return_branch: None,
            return_commit: None,
            state: wire::CheckoutLeaseState::Preparing,
            held_reason: None,
            updated_at: 0,
        };
        self.runner_put_lease(lease);
        let repo = PathBuf::from(self.project_path(&entry.project).unwrap_or_default());
        let project = entry.project.clone();
        let cmd_tx = self.cmd_tx.clone();
        tokio::spawn(async move {
            let result = git::inspect(&repo).await;
            let _ = cmd_tx
                .send(Command::Runner(RunnerCommand::CheckoutInspected {
                    project,
                    task_id,
                    result,
                }))
                .await;
        });
    }

    fn runner_preparing(&self, project: &str, task_id: &str) -> Option<wire::CheckoutLease> {
        self.runner
            .leases
            .get(project)
            .filter(|l| l.task_id == task_id && l.state == wire::CheckoutLeaseState::Preparing)
            .cloned()
    }

    /// Whether the entry a preparing lease is for should still start.
    fn runner_lease_wanted(&self, lease: &wire::CheckoutLease) -> bool {
        self.runner_is_queued(&lease.task_id)
    }

    /// A refusal left the checkout untouched: release it and hold the queue.
    async fn runner_checkout_refused(&mut self, project: &str, reason: wire::RunnerWait) {
        self.runner_drop_lease(project);
        self.runner
            .checkout_blocks
            .insert(project.to_string(), reason);
        self.runner_dispatch(project).await;
        self.runner_emit(project);
    }

    pub(super) async fn runner_checkout_inspected(
        &mut self,
        project: &str,
        task_id: &str,
        result: Result<ReturnPoint, wire::RunnerWait>,
    ) {
        let Some(mut lease) = self.runner_preparing(project, task_id) else {
            return;
        };
        let point = match result {
            Ok(point) => point,
            Err(reason) => {
                self.runner.forced.remove(task_id);
                return self.runner_checkout_refused(project, reason).await;
            }
        };
        if !self.runner_lease_wanted(&lease) {
            self.runner_drop_lease(project);
            self.runner_dispatch(project).await;
            self.runner_emit(project);
            return;
        }
        lease.return_branch = point.branch.clone();
        lease.return_commit = Some(point.commit.clone());
        let branch = lease.branch.clone();
        self.runner_put_lease(lease);
        let repo = PathBuf::from(self.project_path(project).unwrap_or_default());
        let persist = self.persist.clone();
        let cmd_tx = self.cmd_tx.clone();
        let (project, task_id) = (project.to_string(), task_id.to_string());
        tokio::spawn(async move {
            // The return point must be on disk before the checkout moves.
            persist.flush().await;
            let result = git::switch_to_task(&repo, &branch, &point).await;
            let _ = cmd_tx
                .send(Command::Runner(RunnerCommand::CheckoutSwitched {
                    project,
                    task_id,
                    result,
                }))
                .await;
        });
    }

    pub(super) async fn runner_checkout_switched(
        &mut self,
        project: &str,
        task_id: &str,
        result: Result<String, wire::RunnerWait>,
    ) {
        let Some(mut lease) = self.runner_preparing(project, task_id) else {
            return;
        };
        let base = match result {
            Ok(base) => base,
            Err(reason) => {
                self.runner.forced.remove(task_id);
                return self.runner_checkout_refused(project, reason).await;
            }
        };
        if self.runner_lease_wanted(&lease) {
            let settings = self.runner_settings(project);
            let path = self.project_path(project).unwrap_or_default();
            let force = self.runner.forced.remove(task_id);
            if let Ok(choice) = self.runner_pick(task_id, &settings, &path, force) {
                self.runner_start(choice, super::dispatch::StartIn::Leased(base.clone()))
                    .await;
            }
        }
        let started = self
            .runner
            .entries
            .get(task_id)
            .is_some_and(|e| e.state == wire::RunnerEntryState::Running);
        if started {
            lease.state = wire::CheckoutLeaseState::Running;
            self.runner_put_lease(lease);
        } else {
            self.runner_give_back(lease, Some(base));
        }
        self.runner_dispatch(project).await;
        self.runner_emit(project);
    }

    /// An entry left `Running`/`Delivering` or the queue: a checkout it
    /// held goes back.
    pub(super) fn runner_checkout_entry_left(&mut self, task_id: &str) {
        let Some(lease) = self
            .runner
            .leases
            .values()
            .find(|l| l.task_id == task_id && l.state == wire::CheckoutLeaseState::Running)
            .cloned()
        else {
            return;
        };
        let base = self
            .tasks
            .get(&lease.task_id)
            .and_then(|t| t.base_branch.clone());
        self.runner_give_back(lease, base);
    }

    fn runner_give_back(&mut self, mut lease: wire::CheckoutLease, base: Option<String>) {
        lease.state = wire::CheckoutLeaseState::Returning;
        let back = lease.return_commit.clone().map(|commit| ReturnPoint {
            branch: lease.return_branch.clone(),
            commit,
        });
        let (project, task_id, branch) = (
            lease.project.clone(),
            lease.task_id.clone(),
            lease.branch.clone(),
        );
        self.runner_put_lease(lease);
        let repo = PathBuf::from(self.project_path(&project).unwrap_or_default());
        let cmd_tx = self.cmd_tx.clone();
        tokio::spawn(async move {
            let result = git::give_back(&repo, &branch, back.as_ref(), base.as_deref()).await;
            let _ = cmd_tx
                .send(Command::Runner(RunnerCommand::CheckoutReturned {
                    project,
                    task_id,
                    result,
                }))
                .await;
        });
    }

    pub(super) async fn runner_checkout_returned(
        &mut self,
        project: &str,
        task_id: &str,
        result: GiveBack,
    ) {
        let Some(mut lease) = self
            .runner
            .leases
            .get(project)
            .filter(|l| l.task_id == task_id && l.state == wire::CheckoutLeaseState::Returning)
            .cloned()
        else {
            return;
        };
        match result {
            GiveBack::Returned | GiveBack::Released => {
                let held = lease.held_reason.clone();
                self.runner_drop_lease(project);
                if let Some(task) = self.tasks.get_mut(task_id).filter(|t| {
                    t.blocked_kind == Some(wire::TaskBlockedKind::CheckoutHeld)
                        || (held.is_some() && t.blocked_reason == held)
                }) {
                    task.blocked_reason = None;
                    task.blocked_kind = None;
                    task.set_status(TaskStatus::Waiting);
                    let updated = task.clone();
                    self.persist(&updated);
                    self.emit(Event::TaskUpdated(updated));
                }
                if result == GiveBack::Returned && self.workflow_runs.contains_key(task_id) {
                    let to = lease
                        .return_branch
                        .clone()
                        .unwrap_or_else(|| "the commit it was on".to_string());
                    self.workflow_timeline(
                        task_id,
                        format!("The project checkout is back on {to}."),
                    );
                }
                self.runner_dispatch(project).await;
            }
            GiveBack::Held(reason) => {
                lease.state = wire::CheckoutLeaseState::Held;
                lease.held_reason = Some(reason.clone());
                self.runner_put_lease(lease);
                if self.workflow_runs.contains_key(task_id) {
                    self.workflow_timeline(task_id, reason.clone());
                }
                if let Some(task) = self.tasks.get_mut(task_id) {
                    task.blocked_reason = Some(reason);
                    task.blocked_kind = Some(wire::TaskBlockedKind::CheckoutHeld);
                    task.set_status(TaskStatus::Blocked);
                    let updated = task.clone();
                    self.persist(&updated);
                    self.emit(Event::TaskUpdated(updated));
                }
            }
        }
        self.runner_emit(project);
    }

    /// Try again to give back a checkout left held.
    pub(super) fn runner_checkout_retry(&mut self, project: &str) {
        let Some(lease) = self
            .runner
            .leases
            .get(project)
            .filter(|l| l.state == wire::CheckoutLeaseState::Held)
            .cloned()
        else {
            return;
        };
        let base = self
            .tasks
            .get(&lease.task_id)
            .and_then(|t| t.base_branch.clone());
        self.runner_give_back(lease, base);
    }

    /// At boot, before the entries are swept: keep a lease whose run is still
    /// in flight, and give back every other one.
    pub(super) fn runner_checkout_restore(&mut self) {
        let leases: Vec<wire::CheckoutLease> = self.runner.leases.values().cloned().collect();
        for mut lease in leases {
            let running = self.runner.entries.get(&lease.task_id).is_some_and(|e| {
                matches!(
                    e.state,
                    wire::RunnerEntryState::Running | wire::RunnerEntryState::Delivering
                )
            });
            let base = self
                .tasks
                .get(&lease.task_id)
                .and_then(|t| t.base_branch.clone());
            match lease.state {
                wire::CheckoutLeaseState::Held => {}
                _ if running => {
                    if lease.state != wire::CheckoutLeaseState::Running {
                        lease.state = wire::CheckoutLeaseState::Running;
                        self.runner_put_lease(lease);
                    }
                }
                _ => self.runner_give_back(lease, base),
            }
        }
    }
}
