use tokio::sync::oneshot;
use warpforge_protocol as wire;

use crate::daemon::actor::{Command, Daemon, DaemonHandle};
use crate::daemon::workflow::{evidence, StageKind};

impl DaemonHandle {
    /// Reserve a file for a screenshot a verify stage just took.
    /// @param task_id the agent's task
    /// @param mime the image's MIME type
    /// @returns the evidence name and the path to write it to, or `None` when
    /// the task is not a running verify stage
    pub(crate) async fn keep_workflow_evidence(
        &self,
        task_id: &str,
        mime: &str,
    ) -> Option<(String, String)> {
        let (reply, rx) = oneshot::channel();
        self.send(Command::WorkflowKeepEvidence {
            task_id: task_id.into(),
            mime: mime.into(),
            reply,
        })
        .await;
        rx.await.ok().flatten()
    }
}

impl Daemon {
    /// Reserve a file for a verify stage's screenshot and list it on the run.
    pub(crate) fn workflow_keep_evidence(
        &mut self,
        task_id: &str,
        mime: &str,
    ) -> Option<(String, String)> {
        let parent_id = self.workflow_child_of(task_id)?;
        let run = self.workflow_runs.get_mut(&parent_id)?;
        if run.active_children.get(task_id) != Some(&StageKind::Verify) {
            return None;
        }
        let seq = run
            .verifications
            .iter()
            .map(|v| v.evidence.len())
            .sum::<usize>()
            + 1;
        let name = evidence::file_name(seq, mime);
        let path = evidence::run_dir(&parent_id)?
            .join(&name)
            .to_string_lossy()
            .into_owned();
        run.verification_mut(task_id)?
            .evidence
            .push(wire::WorkflowEvidence {
                name: name.clone(),
                path: path.clone(),
                mime_type: mime.to_string(),
            });
        let snapshot = run.clone();
        self.workflow_sync(&snapshot);
        Some((name, path))
    }
}
