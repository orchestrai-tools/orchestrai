//! Stop all Factory tasks of a project: end every running pipeline, which
//! frees its slot and gives back a project checkout it held, and remove the
//! tasks still queued.

use warpforge_protocol as wire;

use crate::daemon::actor::Daemon;
use crate::daemon::workflow::WorkflowOutcome;

impl Daemon {
    pub(super) async fn runner_stop(&mut self, project: &str) -> Result<(), String> {
        self.runner_require_project(project)?;
        let (queued, running): (Vec<_>, Vec<_>) = self
            .runner
            .entries
            .values()
            .filter(|e| e.project == project)
            .filter(|e| {
                matches!(
                    e.state,
                    wire::RunnerEntryState::Queued | wire::RunnerEntryState::Running
                )
            })
            .map(|e| (e.task_id.clone(), e.state))
            .partition(|(_, state)| *state == wire::RunnerEntryState::Queued);
        for (task_id, _) in queued {
            let preparing = self
                .runner
                .leases
                .get(project)
                .is_some_and(|l| l.task_id == task_id);
            if !preparing {
                self.runner_discard_queued(&task_id);
            }
        }
        for (task_id, _) in running {
            if !self.workflow_is_active(&task_id) {
                continue;
            }
            if let Err(error) = self
                .workflow_finalize(&task_id, WorkflowOutcome::Stopped)
                .await
            {
                eprintln!("[runner] stopping {task_id}: {error}");
            }
        }
        self.runner_emit(project);
        Ok(())
    }
}
