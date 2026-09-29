//! Stop: pause the Factory and end every pipeline it is running. Their items
//! go back to the queue, and a project checkout they held is given back.

use warpforge_protocol as wire;

use crate::daemon::actor::Daemon;
use crate::daemon::workflow::WorkflowOutcome;

/// Why an item Stop sent back waits in the queue.
pub(super) const STOPPED_BY_YOU: &str = "stopped by you";

impl Daemon {
    pub(super) async fn runner_stop(&mut self, project: &str) -> Result<(), String> {
        self.runner_require_project(project)?;
        self.runner_pause(project);
        self.runner.checkout_blocks.remove(project);
        let running: Vec<(String, String)> = self
            .runner
            .entries
            .values()
            .filter(|e| e.project == project && e.state == wire::RunnerEntryState::Running)
            .filter_map(|e| Some((e.item_id.clone(), e.task_id.clone()?)))
            .collect();
        for (item_id, task_id) in running {
            if !self.workflow_is_active(&task_id) {
                continue;
            }
            self.runner.stopping.insert(item_id.clone());
            if let Err(error) = self
                .workflow_finalize(&task_id, WorkflowOutcome::Stopped)
                .await
            {
                eprintln!("[runner] stopping {task_id}: {error}");
            }
            self.runner.stopping.remove(&item_id);
        }
        self.runner_dispatch(project).await;
        self.runner_emit(project);
        Ok(())
    }

    /// Put an item whose run Stop ended back in the queue.
    pub(super) fn runner_requeue(&mut self, item_id: &str) {
        let Some(mut entry) = self.runner.entries.get(item_id).cloned() else {
            return;
        };
        let project = entry.project.clone();
        entry.state = wire::RunnerEntryState::Queued;
        entry.task_id = None;
        entry.run_id = None;
        entry.pr_url = None;
        entry.pr_number = None;
        entry.waiting_reason = Some(STOPPED_BY_YOU.to_string());
        self.runner_put_entry(entry);
        self.runner_write_item(&project, item_id, "todo", None);
    }
}
