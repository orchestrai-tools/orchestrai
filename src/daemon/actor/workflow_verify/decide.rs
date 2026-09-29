use warpforge_protocol as wire;

use crate::daemon::actor::Daemon;
use crate::daemon::workflow::{self, FindingsSource, RunState, StageKind, WorkflowOutcome};

impl Daemon {
    /// `workflow.decide` at a verify barrier: `extend` retries (after a fix
    /// when it failed), `finish` continues to review without a pass.
    pub(crate) async fn workflow_verify_decide(
        &mut self,
        parent_id: &str,
        decision: wire::WorkflowDecision,
        rounds: Option<u32>,
        note: Option<String>,
    ) -> Result<(), String> {
        let blocked = match self.workflow_runs.get(parent_id).map(|run| &run.state) {
            Some(RunState::AwaitingVerifyDecision { blocked, .. }) => *blocked,
            _ => return Err("the pipeline is not waiting for a verify decision".to_string()),
        };
        match decision {
            wire::WorkflowDecision::Extend => {
                let guidance = note.filter(|note| !note.trim().is_empty());
                if let Some(message) = guidance.as_ref() {
                    self.emit_session(
                        parent_id,
                        wire::SessionUpdate::UserMessage {
                            text: message.clone(),
                            attachments: vec![],
                        },
                    );
                }
                let granted = rounds.unwrap_or(1).clamp(1, workflow::MAX_EXTEND_ROUNDS);
                if let Some(run) = self.workflow_runs.get_mut(parent_id) {
                    if !blocked {
                        run.verify_extra += granted;
                    }
                    run.pending_guidance = guidance;
                    run.pause_requested = false;
                }
                let next = if blocked {
                    StageKind::Verify
                } else {
                    StageKind::Fix
                };
                self.workflow_timeline(
                    parent_id,
                    if blocked {
                        "Retrying verification.".to_string()
                    } else {
                        format!(
                            "You granted {granted} more verify attempt(s) — continuing with a fix."
                        )
                    },
                );
                self.workflow_advance(parent_id, next).await;
            }
            wire::WorkflowDecision::Finish => {
                if let Some(run) = self.workflow_runs.get_mut(parent_id) {
                    run.findings_source = FindingsSource::Review;
                }
                self.workflow_timeline(
                    parent_id,
                    "You chose to continue to review without a passing verification.",
                );
                self.workflow_advance(parent_id, StageKind::Review).await;
            }
            wire::WorkflowDecision::Stop => {
                self.workflow_finalize(parent_id, WorkflowOutcome::Stopped)
                    .await?;
            }
        }
        Ok(())
    }
}
