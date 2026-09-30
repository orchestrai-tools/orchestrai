//! Starting a Factory task's pipeline on its already-created task: in a fresh
//! worktree forked from origin's default branch, in the project checkout on a
//! task branch (`checkout/`), or, for a task that opens no pull request, in
//! the project checkout as it is.

use warpforge_protocol as wire;

use super::dispatch::Choice;
use super::now_secs;
use crate::daemon::actor::Daemon;
use crate::daemon::worktree::StartPoint;

/// Where a pipeline starts.
pub(super) enum StartIn {
    /// A fresh worktree forked from origin's default branch.
    Worktree,
    /// The project checkout, already switched to the task branch; carries
    /// origin's default branch.
    Leased(String),
    /// The project checkout as it is, for a task that opens no pull request.
    InPlace,
}

impl Daemon {
    /// Start `choice`'s pipeline on its already-created task.
    pub(super) async fn runner_start(&mut self, choice: Choice, place: StartIn) {
        let Choice {
            mut entry,
            item,
            workflow,
            agent,
            model,
            location: _,
        } = choice;
        let (location, use_worktree, base) = match place {
            StartIn::Worktree => (wire::RunLocation::Worktree, true, None),
            StartIn::Leased(base) => (wire::RunLocation::Checkout, false, Some(base)),
            StartIn::InPlace => (wire::RunLocation::Checkout, false, None),
        };
        let now = now_secs();
        let project = entry.project.clone();
        let task_id = entry.task_id.clone();
        if let Some(item) = item.as_ref() {
            entry.number = item.number;
            entry.title = item.title.clone();
            entry.priority = item.priority.clone();
        }
        let mut run = wire::ItemRun {
            id: uuid::Uuid::new_v4().to_string(),
            project: project.clone(),
            item_id: entry.item_id.clone().unwrap_or_default(),
            item_number: entry.number,
            item_title: entry.title.clone(),
            task_id: Some(task_id.clone()),
            workflow: workflow.clone(),
            agent: agent.clone(),
            model: model.clone(),
            enqueued_at: entry.enqueued_at,
            dispatched_at: now,
            finished_at: None,
            pr_opened_at: None,
            merged_at: None,
            closed_at: None,
            rounds: 0,
            fix_rounds: 0,
            cost_usd: None,
            outcome: wire::ItemRunOutcome::Running,
            detail: None,
            pr_url: None,
            pr_number: None,
            run_location: Some(location),
            deliver: entry.deliver,
        };
        self.runner.dispatches.push((project.clone(), now));
        let (prompt, tags) = self
            .tasks
            .get(&task_id)
            .map(|t| (t.prompt.clone(), t.tags.clone()))
            .unwrap_or_default();
        let created = self
            .workflow_create(
                project.clone(),
                prompt,
                agent,
                tags,
                use_worktree,
                StartPoint::Origin,
                workflow,
                std::mem::take(&mut entry.attachments),
                model,
                entry.include_runtime_context,
                entry.config_overrides.clone(),
                None,
                entry.item_id.clone(),
                Some(task_id.clone()),
            )
            .await;
        match created {
            Ok(_) => {
                if let Some(task) = self.tasks.get_mut(&task_id).filter(|_| base.is_some()) {
                    task.base_branch = base;
                    let updated = task.clone();
                    self.persist(&updated);
                }
                entry.state = wire::RunnerEntryState::Running;
                entry.run_id = Some(run.id.clone());
                entry.resolved_location = Some(location);
                entry.wait = None;
                self.runner_put_entry(entry.clone());
                self.runner_put_run(run, false);
                if let Some(item_id) = entry.item_id.as_deref() {
                    self.runner_write_item(&project, item_id, "in_progress", Some(&task_id));
                }
            }
            Err(error) => {
                let detail = format!("the pipeline could not start: {error}");
                run.outcome = wire::ItemRunOutcome::Failed;
                run.finished_at = Some(now);
                run.detail = Some(detail.clone());
                self.runner_drop_entry(&task_id);
                self.runner_put_run(run, false);
                self.runner_block_task(&task_id, detail);
            }
        }
    }
}
