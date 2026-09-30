//! Ending an attempt: the pipeline's outcome, its off-loop wrap-up (cost and
//! delivery), a deleted task, and the tick that sweeps what nothing reported.
//! Every terminal path here frees the entry's slot (ADR 0023 invariant 3).

use warpforge_protocol as wire;

use super::deliver::{self, Delivery, DeliveryJob, Wrapup};
use super::{now_secs, RunnerCommand};
use crate::daemon::actor::{Command, Daemon};
use crate::daemon::runner::{self as logic, DAY_SECS};
use crate::daemon::task::TaskStatus;
use crate::daemon::workflow::{self, RunState, StageKind, WorkflowOutcome, WorkflowRun};

/// The last verification as Markdown, when the workflow has a verify stage.
fn verification_report(run: &WorkflowRun) -> Option<String> {
    let last = run.verifications.last()?;
    let verdict = match last.verdict? {
        wire::WorkflowVerifyVerdict::Pass => "passed",
        wire::WorkflowVerifyVerdict::Fail => "failed",
        wire::WorkflowVerifyVerdict::Blocked => "could not run",
    };
    let mut lines = vec![format!("Verification {verdict}: {}", last.summary.trim())];
    for item in &last.checklist {
        let status = match item.status {
            wire::WorkflowCheckStatus::Pass => "pass",
            wire::WorkflowCheckStatus::Fail => "fail",
            wire::WorkflowCheckStatus::Skipped => "skipped",
        };
        let note = item
            .note
            .as_deref()
            .map(|n| format!(" — {n}"))
            .unwrap_or_default();
        lines.push(format!("- [{status}] {}{note}", item.step));
    }
    Some(lines.join("\n"))
}

impl Daemon {
    /// Called by `workflow_finalize` for every pipeline that ends. Does
    /// nothing for a pipeline the Factory did not schedule.
    pub(crate) fn runner_pipeline_finished(&mut self, task_id: &str, outcome: &WorkflowOutcome) {
        let Some(mut entry) = self.runner.entries.get(task_id).cloned() else {
            return;
        };
        if entry.state != wire::RunnerEntryState::Running {
            return;
        }
        let project = entry.project.clone();
        let mut run = entry
            .run_id
            .as_ref()
            .and_then(|id| self.runner.runs.get(id).cloned());
        let workflow_run = self.workflow_runs.get(task_id).cloned();
        if let (Some(run), Some(workflow_run)) = (run.as_mut(), workflow_run.as_ref()) {
            run.rounds = workflow_run.round;
            run.fix_rounds = workflow_run
                .history
                .iter()
                .filter(|record| record.kind == StageKind::Fix)
                .count() as u32;
            run.finished_at = Some(now_secs());
        }
        let children: Vec<String> = workflow_run
            .as_ref()
            .map(|r| r.all_children().into_iter().collect())
            .unwrap_or_default();
        let ended = match outcome {
            WorkflowOutcome::Success { limit_hit: false } if !entry.deliver => Some((
                wire::ItemRunOutcome::Completed,
                "the pipeline succeeded; the change waits for you to commit it".to_string(),
            )),
            WorkflowOutcome::Success { limit_hit: false } => None,
            WorkflowOutcome::Success { limit_hit: true } => Some((
                wire::ItemRunOutcome::LimitHit,
                "the review rounds ran out with findings open".to_string(),
            )),
            WorkflowOutcome::Stopped => Some((
                wire::ItemRunOutcome::Stopped,
                "the pipeline was stopped".to_string(),
            )),
            WorkflowOutcome::Error(reason) => Some((
                wire::ItemRunOutcome::Failed,
                format!("the pipeline failed: {reason}"),
            )),
        };
        let job = match ended {
            Some((result, detail)) => {
                if result == wire::ItemRunOutcome::Completed {
                    self.runner_drop_entry(task_id);
                } else {
                    self.runner_end_entry(task_id);
                }
                if let Some(mut run) = run.clone() {
                    run.outcome = result;
                    run.detail = Some(detail);
                    self.runner_put_run(run, true);
                }
                None
            }
            None => match self.runner_delivery_job(task_id, &entry, workflow_run.as_ref()) {
                Ok(job) => {
                    entry.state = wire::RunnerEntryState::Delivering;
                    self.runner_put_entry(entry);
                    if let Some(mut run) = run.clone() {
                        run.outcome = wire::ItemRunOutcome::Delivering;
                        self.runner_put_run(run, false);
                    }
                    Some(job)
                }
                Err(detail) => {
                    self.runner_end_entry(task_id);
                    if let Some(mut run) = run.clone() {
                        run.outcome = wire::ItemRunOutcome::DeliveryFailed;
                        run.detail = Some(detail);
                        self.runner_put_run(run, true);
                    }
                    None
                }
            },
        };
        self.runner_emit(&project);
        if let Some(run) = run {
            self.runner_spawn_wrapup(task_id.to_string(), run.id, children, job);
        }
        self.runner_schedule_dispatch(project);
    }

    /// What delivering `task_id` needs, read now on the loop.
    fn runner_delivery_job(
        &self,
        task_id: &str,
        entry: &wire::RunnerEntry,
        workflow_run: Option<&WorkflowRun>,
    ) -> Result<DeliveryJob, String> {
        let task = self
            .tasks
            .get(task_id)
            .ok_or_else(|| "the pipeline task is gone".to_string())?;
        let worktree = task
            .worktree
            .clone()
            .or_else(|| self.runner_checkout_dir(task_id))
            .ok_or_else(|| "the pipeline ran without an isolated checkout".to_string())?;
        let item = entry
            .item_id
            .as_deref()
            .and_then(|id| self.runner_read_item(&entry.project, id).ok().flatten());
        let title = if task.title.trim().is_empty() {
            entry.title.as_str()
        } else {
            task.title.as_str()
        };
        let summary = workflow_run.and_then(|r| r.last_summary.clone());
        let report = workflow_run.and_then(verification_report);
        let deferred = workflow_run
            .filter(|r| !r.deferred_findings.is_empty())
            .map(|r| workflow::format_findings(&r.deferred_findings));
        let facts = logic::PrFacts {
            summary: summary.as_deref(),
            report: report.as_deref(),
            deferred: deferred.as_deref(),
            workflow: workflow_run.map(|r| r.spec.id.as_str()).unwrap_or_default(),
            rounds: workflow_run.map(|r| r.round).unwrap_or_default(),
            cost_usd: None,
        };
        let item = item.or_else(|| {
            entry
                .item_id
                .as_ref()
                .map(|_| deliver::item_from_entry(entry))
        });
        Ok(DeliveryJob {
            project_path: self.project_path(&entry.project).unwrap_or_default(),
            worktree,
            base: task.base_branch.clone(),
            title: logic::pr_title(item.as_ref(), title),
            message: logic::commit_message(item.as_ref(), title, summary.as_deref()),
            body: logic::pr_body(item.as_ref(), &facts),
        })
    }

    fn runner_spawn_wrapup(
        &mut self,
        task_id: String,
        run_id: String,
        children: Vec<String>,
        job: Option<DeliveryJob>,
    ) {
        self.runner.finishing.insert(task_id.clone());
        deliver::spawn(Wrapup {
            task_id,
            run_id,
            children,
            job,
            persist: self.persist.clone(),
            store: self.store.clone(),
            open_pr: self.runner.open_pr.clone(),
            cmd_tx: self.cmd_tx.clone(),
        });
    }

    /// Queue a dispatch pass for `project` behind the current command, so no
    /// pipeline hook starts another pipeline from inside itself.
    pub(super) fn runner_schedule_dispatch(&self, project: String) {
        let cmd_tx = self.cmd_tx.clone();
        tokio::spawn(async move {
            let _ = cmd_tx
                .send(Command::Runner(RunnerCommand::Dispatch { project }))
                .await;
        });
    }

    /// Remove an entry that did not end in an open pull request; its item
    /// goes back to `todo` so it can be started again.
    pub(super) fn runner_end_entry(&mut self, task_id: &str) {
        let Some(entry) = self.runner.entries.get(task_id).cloned() else {
            return;
        };
        self.runner_drop_entry(task_id);
        if let Some(item_id) = entry.item_id.as_deref() {
            self.runner_write_item(&entry.project, item_id, "todo", None);
        }
    }

    pub(super) async fn runner_finished(
        &mut self,
        task_id: &str,
        run_id: &str,
        cost_usd: Option<f64>,
        delivery: Option<Delivery>,
    ) {
        self.runner.finishing.remove(task_id);
        let Some(mut run) = self.runner.runs.get(run_id).cloned() else {
            return;
        };
        run.cost_usd = cost_usd;
        let project = run.project.clone();
        let entry = self
            .runner
            .entries
            .get(task_id)
            .filter(|e| e.run_id.as_deref() == Some(run_id))
            .cloned();
        if let Some(delivery) = delivery.as_ref() {
            self.runner_report_delivery(task_id, delivery);
        }
        match (delivery, entry) {
            (None, _) => {}
            (Some(Delivery::Opened { url, number }), Some(mut entry)) => {
                run.outcome = wire::ItemRunOutcome::Delivered;
                run.pr_url = Some(url.clone());
                run.pr_number = number;
                run.pr_opened_at = Some(now_secs());
                entry.state = wire::RunnerEntryState::Delivered;
                entry.pr_url = Some(url);
                entry.pr_number = number;
                let item_id = entry.item_id.clone();
                self.runner_put_entry(entry);
                if let Some(item_id) = item_id.as_deref() {
                    self.runner_write_item(&project, item_id, "waiting", None);
                }
                self.runner_watch(task_id.to_string());
            }
            (Some(Delivery::NoChanges), _) => {
                run.outcome = wire::ItemRunOutcome::NoChanges;
                run.detail = Some("the pipeline succeeded but changed nothing".to_string());
                self.runner_end_entry(task_id);
            }
            (Some(Delivery::Failed(reason)), _) => {
                run.outcome = wire::ItemRunOutcome::DeliveryFailed;
                run.detail = Some(reason);
                self.runner_end_entry(task_id);
            }
            (Some(Delivery::Opened { url, number }), None) => {
                run.outcome = wire::ItemRunOutcome::TaskDeleted;
                run.pr_url = Some(url);
                run.pr_number = number;
                run.detail = Some("the task was deleted while its pull request opened".to_string());
            }
        }
        self.runner_put_run(run, false);
        self.runner_emit(&project);
        self.runner_dispatch(&project).await;
    }

    /// A deleted task ends whatever attempt it carried. A queued one had
    /// none, and its item was never touched.
    pub(crate) fn runner_task_deleted(&mut self, task_id: &str) {
        let Some(entry) = self.runner.entries.get(task_id).cloned() else {
            return;
        };
        if entry.state == wire::RunnerEntryState::Queued {
            self.runner_drop_entry(task_id);
            self.runner_emit(&entry.project);
            self.runner_schedule_dispatch(entry.project);
            return;
        }
        if let Some(mut run) = entry
            .run_id
            .as_ref()
            .and_then(|id| self.runner.runs.get(id).cloned())
        {
            if !run.outcome.is_final() {
                run.outcome = wire::ItemRunOutcome::TaskDeleted;
                run.finished_at.get_or_insert(now_secs());
                run.detail = Some("the pipeline task was deleted".to_string());
                self.runner_put_run(run, self.runner.finishing.contains(task_id));
            }
        }
        self.runner_end_entry(task_id);
        self.runner_emit(&entry.project);
        self.runner_schedule_dispatch(entry.project);
    }

    /// How a pipeline that already ended ended, for an entry that missed the
    /// hook (a daemon that stopped right after finalize).
    fn runner_recovered_outcome(&self, task_id: &str) -> Option<WorkflowOutcome> {
        let run = self.workflow_runs.get(task_id)?;
        match run.state {
            RunState::Done => Some(WorkflowOutcome::Success {
                limit_hit: !run.open_findings.is_empty(),
            }),
            RunState::Failed => {
                let task = self.tasks.get(task_id)?;
                Some(if task.status == TaskStatus::Interrupted {
                    WorkflowOutcome::Stopped
                } else {
                    WorkflowOutcome::Error(
                        task.blocked_reason
                            .clone()
                            .unwrap_or_else(|| "the pipeline failed".to_string()),
                    )
                })
            }
            _ => None,
        }
    }

    /// Reconcile every entry with the task and pipeline it names: at boot,
    /// and on every tick for whatever no event reported.
    pub(super) fn runner_sweep(&mut self) {
        let entries: Vec<wire::RunnerEntry> = self.runner.entries.values().cloned().collect();
        for entry in entries {
            let task_id = entry.task_id.clone();
            if !self.tasks.contains_key(&task_id) {
                self.runner_task_deleted(&task_id);
                continue;
            }
            match entry.state {
                wire::RunnerEntryState::Running => {
                    if let Some(outcome) = self.runner_recovered_outcome(&task_id) {
                        self.runner_pipeline_finished(&task_id, &outcome);
                    }
                }
                wire::RunnerEntryState::Delivering if !self.runner.finishing.contains(&task_id) => {
                    let mut entry = entry;
                    entry.state = wire::RunnerEntryState::Running;
                    self.runner.entries.insert(task_id.clone(), entry);
                    let outcome = WorkflowOutcome::Success { limit_hit: false };
                    self.runner_pipeline_finished(&task_id, &outcome);
                }
                _ => {}
            }
        }
    }

    pub(super) async fn runner_tick(&mut self) {
        self.runner_sweep();
        self.runner.checkout_blocks.clear();
        let since = now_secs() - DAY_SECS;
        self.runner.dispatches.retain(|(_, at)| *at > since);
        let mut projects: Vec<String> = self
            .runner
            .entries
            .values()
            .filter(|e| e.state == wire::RunnerEntryState::Queued)
            .map(|e| e.project.clone())
            .collect();
        projects.sort();
        projects.dedup();
        for project in projects {
            self.runner_dispatch(&project).await;
        }
    }
}
