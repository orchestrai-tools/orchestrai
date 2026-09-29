use warpforge_protocol as wire;

use crate::daemon::actor::Daemon;
use crate::daemon::workflow::{self, WorkflowRun};

/// FNV-1a: stable across daemon restarts, unlike `DefaultHasher`, and the
/// fingerprint is persisted with the run.
fn fingerprint(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
    })
}

/// The working-copy diff of a checkout. Takes the directory rather than the
/// daemon so the actor's future never holds `&Daemon` across the await.
pub(super) async fn changes(dir: Option<String>) -> Option<Vec<wire::FileDiff>> {
    crate::daemon::diff::working_diff(&dir?).await.ok()
}

impl Daemon {
    pub(super) fn workflow_checkout(&self, run: &WorkflowRun) -> Option<String> {
        self.tasks
            .get(&run.parent_id)
            .and_then(|task| task.worktree.clone())
            .or_else(|| self.project_path(&run.project))
    }

    /// Remember the working copy a fix starts from. Only the first attempt
    /// sets it, so a fix re-run after a restart still compares against the
    /// code the last verification saw.
    pub(crate) async fn workflow_mark_fix_base(&mut self, run: &mut WorkflowRun) {
        if run.spec.verify.is_some() && run.fix_base.is_none() {
            run.fix_base = changes(self.workflow_checkout(run))
                .await
                .map(|files| fingerprint(&workflow::format_diff(&files)));
        }
    }

    /// Whether the fix that just finished changed the working copy; an
    /// unknown answer counts as changed.
    pub(crate) async fn workflow_fix_changed(&mut self, run: &mut WorkflowRun) -> bool {
        let Some(base) = run.fix_base.take() else {
            return true;
        };
        let now = changes(self.workflow_checkout(run))
            .await
            .map(|files| fingerprint(&workflow::format_diff(&files)));
        now != Some(base)
    }
}
