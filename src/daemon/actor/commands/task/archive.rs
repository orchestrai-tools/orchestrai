use std::collections::HashSet;

use crate::daemon::actor::{Daemon, Event};
use crate::daemon::task::TaskStatus;
use crate::daemon::workflow::WorkflowOutcome;

impl Daemon {
    /// Archiving retires an entire task tree. Clear every start token before
    /// stopping a pipeline: a checkout or replay read can still finish later.
    pub(super) async fn archive_task_tree(&mut self, id: &str) {
        let mut ids = vec![id.to_string()];
        let mut seen = HashSet::from([id.to_string()]);
        let mut next = 0;
        while next < ids.len() {
            let parent = ids[next].clone();
            for child in self
                .tasks
                .values()
                .filter(|t| t.parent_task_id.as_deref() == Some(&parent))
            {
                if seen.insert(child.id.clone()) {
                    ids.push(child.id.clone());
                }
            }
            next += 1;
        }
        // All descendants are known before workflow finalization mutates them.
        // Drop normal sessions first so no child can wake its archived parent.
        for task_id in &ids {
            self.pending_session_starts.remove(task_id);
            self.blocked_starts.remove(task_id);
            self.pending_workflow_starts.remove(task_id);
            if let Some(pending) = self.pending_resume.remove(task_id) {
                pending.reject_followups("task archived while reconnecting");
            }
            self.resume_replay.remove(task_id);
            self.pending_wake.remove(task_id);
            self.drop_pending_permissions(task_id);
            if let Some(handle) = self.sessions.remove(task_id) {
                // Intentional process stop is immediate and nonblocking. The
                // process guard reaps it off the actor loop.
                handle.cancel();
            }
            if self.runner_is_queued(task_id) {
                self.runner_task_deleted(task_id);
            }
        }
        // Finalize parents before children so no stopped child advances a run.
        for task_id in &ids {
            if self.workflow_is_active(task_id) {
                let _ = self
                    .workflow_finalize(task_id, WorkflowOutcome::Stopped)
                    .await;
            }
        }
        for task_id in ids {
            if let Some(task) = self.tasks.get_mut(&task_id) {
                task.queued_prompts.clear();
                task.set_status(TaskStatus::Done);
                let updated = task.clone();
                self.persist(&updated);
                self.emit(Event::TaskUpdated(updated));
            }
        }
        // Archiving one stage without its parent must park that pipeline too.
        self.workflow_child_gone(id).await;
    }
}
