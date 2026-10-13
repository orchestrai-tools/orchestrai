use tokio::sync::oneshot;
use warpforge_protocol as wire;

use crate::daemon::acp::TurnInitiator;
use crate::daemon::actor::{Daemon, PendingResume, PendingSessionStart};
use crate::daemon::task::TaskStatus;

impl Daemon {
    pub(in crate::daemon::actor) fn submit_session_prompt(
        &mut self,
        task_id: String,
        text: String,
        attachments: Vec<wire::PromptAttachment>,
        initiator: TurnInitiator,
        reply: oneshot::Sender<Result<(), String>>,
    ) {
        let root = self.tasks.get(&task_id).map(|task| {
            task.worktree
                .clone()
                .or_else(|| self.project_path(&task.project))
                .unwrap_or_else(|| ".".into())
        });
        let root = match root {
            Some(root) => root,
            None => {
                let _ = reply.send(Err(format!("unknown task {task_id}")));
                return;
            }
        };
        let prepared = crate::daemon::prompt::prepare_prompt(
            std::path::Path::new(&root),
            text.clone(),
            &attachments,
        );
        let prepared = match prepared {
            Ok(value) => value,
            Err(error) => {
                let _ = reply.send(Err(error));
                return;
            }
        };
        // Replay and initialization belong to one start. Preserve subsequent
        // instructions as separate turns; the handshake decides image support.
        if let Some(pending) = self.pending_resume.get_mut(&task_id) {
            pending
                .followups
                .push(crate::daemon::actor::transcript::PendingResumePrompt {
                    prompt: prepared,
                    initiator,
                    reply,
                });
            return;
        }
        let live_delivery = if let Some(handle) = self.sessions.get(&task_id) {
            // Capability rejection is a bad submission, not a dead session.
            // Keep the running turn and its queue intact, and let the caller
            // preserve its draft instead of acknowledging a failed reconnect.
            if prepared.has_images && !handle.supports_images() {
                let _ = reply.send(Err("this agent does not support image prompts".into()));
                return;
            }
            Some(handle.prompt(prepared.clone(), initiator))
        } else {
            None
        };
        match live_delivery {
            Some(Ok(())) => {
                // Neither the status nor the transcript moves here. A
                // message sent mid-turn is queued, and the agent has
                // not been told anything yet: `TurnStarted` marks the
                // task Running and echoes the message, when it goes out.
                let _ = reply.send(Ok(()));
            }
            Some(Err(_)) | None => {
                // A closed command channel is a stale handle. Remove it
                // before reconnecting so its last process guard can
                // terminate/reap the old child.
                self.sessions.remove(&task_id);
                let resume = self.tasks.get(&task_id).and_then(|task| {
                    task.session_id.as_ref().map(|session_id| {
                        (
                            task.project.clone(),
                            task.agent.clone(),
                            session_id.clone(),
                            task.model.clone(),
                        )
                    })
                });

                if let Some((project, agent, session_id, default_model)) = resume {
                    self.mark_task_running(&task_id);
                    // Running already gives the UI a progress signal.
                    // Connection status is not agent-authored text: it
                    // would be persisted and appended to the last turn.
                    // The replay guard is built from the persisted
                    // transcript, which must be read off the loop
                    // (write-behind flush + store read). Start the
                    // session only once the guard has landed, mirroring
                    // WorktreeReady: starting before it would let the
                    // agent's replayed history through unfiltered and
                    // double the output.
                    self.pending_resume.insert(
                        task_id.clone(),
                        PendingResume {
                            project,
                            agent,
                            text: text.clone(),
                            session_id,
                            attachments,
                            default_model,
                            starting: false,
                            followups: Vec::new(),
                        },
                    );
                    self.request_resume_replay_guard(&task_id);
                    let _ = reply.send(Ok(()));
                } else if self.start_chat_session(&task_id, &text, attachments.clone()) {
                    let _ = reply.send(Ok(()));
                } else if let Some(task) = self
                    .tasks
                    .get(&task_id)
                    .filter(|task| task.status == TaskStatus::Blocked)
                    .filter(|task| task.workflow_run.is_none())
                {
                    // Retry a task blocked before its session existed (a
                    // failed checkout, say) from the stashed start, so the
                    // agent gets the task it never ran.
                    let fallback = PendingSessionStart {
                        project: task.project.clone(),
                        agent: task.agent.clone(),
                        prompt: task.prompt.clone(),
                        include_runtime_context: false,
                        attachments: Vec::new(),
                        default_model: task.model.clone(),
                        config_overrides: std::collections::HashMap::new(),
                    };
                    let mut start = self.blocked_starts.remove(&task_id).unwrap_or(fallback);
                    let original_attachments = std::mem::take(&mut start.attachments);
                    let mut combined_attachments = original_attachments.clone();
                    combined_attachments.extend(attachments);
                    let prompt = combine_prompt(&start.prompt, &text);
                    if let Err(error) = crate::daemon::prompt::prepare_prompt(
                        std::path::Path::new(&root),
                        prompt.clone(),
                        &combined_attachments,
                    ) {
                        start.attachments = original_attachments;
                        self.blocked_starts.insert(task_id, start);
                        let _ = reply.send(Err(error));
                        return;
                    }
                    self.start_session(
                        &task_id,
                        &start.project,
                        &start.agent,
                        &prompt,
                        start.include_runtime_context,
                        None,
                        combined_attachments,
                        start.default_model,
                        start.config_overrides,
                    );
                    let _ = reply.send(Ok(()));
                } else {
                    // Reject without echoing a user message that was never delivered.
                    let _ = reply.send(Err("no live or resumable agent session".into()));
                }
            }
        }
    }
}

/// The original task prompt, then the user's message, so a retried session has
/// the task it never started with.
pub(crate) fn combine_prompt(prompt: &str, message: &str) -> String {
    let prompt = prompt.trim();
    let message = message.trim();
    match (prompt.is_empty(), message.is_empty()) {
        (true, _) => message.to_string(),
        (_, true) => prompt.to_string(),
        _ => format!("{prompt}\n\n{message}"),
    }
}
