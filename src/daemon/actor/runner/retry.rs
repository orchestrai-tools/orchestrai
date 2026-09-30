//! A person's direct moves on one Factory task: start a queued one now, past
//! the project's limits, and run a finished, failed or stopped one again as a
//! new task with the same configuration.

use warpforge_protocol as wire;

use super::dispatch::Tried;
use super::tasks::NewFactoryTask;
use crate::daemon::actor::Daemon;
use crate::daemon::runner::{strip_preamble, RUNNER_TAG};
use crate::daemon::task::TaskStatus;

impl Daemon {
    pub(super) async fn runner_start_now(
        &mut self,
        project: &str,
        task_id: &str,
    ) -> Result<(), String> {
        self.runner_require_project(project)?;
        if !self
            .runner
            .entries
            .get(task_id)
            .is_some_and(|e| e.project == project && e.state == wire::RunnerEntryState::Queued)
        {
            return Err("that task is not waiting in the Factory".to_string());
        }
        if self.runner_held(project).is_some() {
            return Err(
                "the project folder needs you first: clean it up, then choose Try again"
                    .to_string(),
            );
        }
        self.runner.checkout_blocks.remove(project);
        let tried = self.runner_try_start(project, task_id, true).await;
        self.runner_dispatch(project).await;
        self.runner_emit(project);
        match tried {
            Tried::Started => Ok(()),
            Tried::Wait => {
                Err("the project folder is being prepared; try again in a moment".into())
            }
            Tried::Skipped(_) | Tried::CheckoutRefused(..) => {
                Err("this task cannot start yet; its row says why".to_string())
            }
        }
    }

    /// The configuration `task_id` ran with: its last attempt, else what the
    /// task itself records (a Factory task that opened no pull request and
    /// started on the spot has no attempt).
    fn runner_config_of(&self, task_id: &str) -> Result<NewFactoryTask, String> {
        let task = self
            .tasks
            .get(task_id)
            .ok_or_else(|| format!("unknown task {task_id}"))?;
        let workflow = task
            .tags
            .iter()
            .find_map(|t| t.strip_prefix("workflow:"))
            .map(str::to_string)
            .ok_or_else(|| "only a Factory task can run again".to_string())?;
        let last = self
            .with_store(|store| store.latest_item_run_of_task(task_id).ok().flatten())
            .flatten();
        let run_location = match last.as_ref().and_then(|r| r.run_location) {
            Some(wire::RunLocation::Checkout) => wire::EntryRunLocation::Checkout,
            Some(_) => wire::EntryRunLocation::Worktree,
            None if task.worktree.is_some() => wire::EntryRunLocation::Worktree,
            None => wire::EntryRunLocation::Checkout,
        };
        let tags = task
            .tags
            .iter()
            .filter(|t| *t != RUNNER_TAG && !t.starts_with("workflow:"))
            .cloned()
            .collect();
        Ok(NewFactoryTask {
            project: task.project.clone(),
            prompt: strip_preamble(&task.prompt).to_string(),
            agent: Some(
                last.as_ref()
                    .map_or(task.agent.clone(), |r| r.agent.clone()),
            ),
            model: last
                .as_ref()
                .map_or(task.model.clone(), |r| r.model.clone()),
            workflow: Some(last.as_ref().map_or(workflow, |r| r.workflow.clone())),
            item_id: task.backlog_item_id.clone(),
            run_location,
            deliver: last.as_ref().is_some_and(|r| r.deliver),
            tags,
            ..NewFactoryTask::default()
        })
    }

    pub(super) async fn runner_retry(
        &mut self,
        task_id: &str,
    ) -> Result<wire::EnqueueResult, String> {
        if self.runner_has_task(task_id) {
            return Err("this task is still in the Factory".to_string());
        }
        if self
            .tasks
            .get(task_id)
            .is_some_and(|t| t.status == TaskStatus::Running)
        {
            return Err("this task is still running".to_string());
        }
        let new = self.runner_config_of(task_id)?;
        let project = new.project.clone();
        let item_id = new.item_id.clone();
        let item = match item_id.as_deref() {
            Some(id) => self
                .runner_read_item(&project, id)
                .map_err(|e| format!("{e:#}"))?,
            None => None,
        };
        let mut skipped = Vec::new();
        if let (Some(id), Some(existing)) = (
            item_id.as_deref(),
            item_id
                .as_deref()
                .and_then(|id| self.runner_task_of_item(id)),
        ) {
            skipped.push(wire::SkippedItem {
                item_id: id.to_string(),
                number: item.as_ref().map(|i| i.number).unwrap_or_default(),
                reason: wire::SkipReason::AlreadyInFactory {
                    task_id: Some(existing),
                },
            });
            return Ok(wire::EnqueueResult {
                created: Vec::new(),
                skipped,
                status: self.runner_status(&project),
            });
        }
        let created = self.runner_create_from_dialog(new).await?;
        Ok(wire::EnqueueResult {
            created: vec![created],
            skipped,
            status: self.runner_status(&project),
        })
    }
}
