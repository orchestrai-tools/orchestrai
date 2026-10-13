mod prompt;

pub(crate) use prompt::combine_prompt;

use std::collections::HashSet;

use warpforge_protocol as wire;

use crate::daemon::actor::{Command, Daemon, Event};
use crate::daemon::task::Task;

impl Daemon {
    pub(crate) async fn handle_session_command(&mut self, cmd: Command) {
        match cmd {
            Command::ListSessions { project, reply } => {
                let path = self.project_path(&project);
                let agents = self.configured_agents.clone();
                let owned: HashSet<String> = self
                    .tasks
                    .values()
                    .filter(|task| task.project == project)
                    .filter_map(|task| task.session_id.clone())
                    .collect();
                tokio::task::spawn_blocking(move || {
                    let sessions = match path {
                        Some(p) => crate::daemon::sessions::external_sessions(&p, &agents),
                        None => Vec::new(),
                    };
                    let _ = reply.send(outside_sessions(sessions, &owned));
                });
            }
            Command::ResumeTask {
                project,
                agent,
                session_id,
                title,
                reply,
            } => {
                let prompt = if title.is_empty() {
                    format!("Resumed {agent} session")
                } else {
                    title
                };
                let task = Task::new(&project, &prompt, &agent, vec!["resumed".into()]);
                let id = task.id.clone();
                // A freshly resumed external session carries no model intent
                // yet; threaded so the resume path reads the task, not a
                // hardcoded None.
                let default_model = task.model.clone();
                self.tasks.insert(id.clone(), task.clone());
                self.persist(&task);
                self.emit(Event::TaskCreated(task));
                let _ = reply.send(id.clone());
                // Load history only (empty prompt); user continues via session.prompt.
                self.start_session(
                    &id,
                    &project,
                    &agent,
                    "",
                    false,
                    Some(session_id),
                    vec![],
                    default_model,
                    std::collections::HashMap::new(),
                );
            }
            Command::SessionInterrupt { task_id, reply } => {
                // The verdict comes from the session driver, the only thing
                // that knows whether anything is queued. Off the loop, like
                // every other round-trip into a session.
                match self.sessions.get(&task_id).cloned() {
                    Some(handle) => {
                        tokio::spawn(async move {
                            let _ = reply.send(handle.interrupt().await);
                        });
                    }
                    None => {
                        let _ = reply.send(Err("this task has no running agent session".into()));
                    }
                }
            }
            Command::SessionRemoveQueued {
                task_id,
                queued_id,
                reply,
            } => {
                // The queue lives in the session driver, so it decides whether
                // that message is still waiting. Off the loop, like interrupt.
                match self.sessions.get(&task_id).cloned() {
                    Some(handle) => {
                        tokio::spawn(async move {
                            let _ = reply.send(handle.remove_queued(queued_id).await);
                        });
                    }
                    None => {
                        let _ = reply.send(Err("this task has no running agent session".into()));
                    }
                }
            }
            Command::SessionEditQueued {
                task_id,
                queued_id,
                text,
                reply,
            } => match self.sessions.get(&task_id).cloned() {
                Some(handle) => {
                    tokio::spawn(async move {
                        let _ = reply.send(handle.edit_queued(queued_id, text).await);
                    });
                }
                None => {
                    let _ = reply.send(Err("this task has no running agent session".into()));
                }
            },
            Command::SessionPrompt {
                task_id,
                text,
                attachments,
                initiator,
                reply,
            } => {
                self.submit_session_prompt(task_id, text, attachments, initiator, reply);
            }
            Command::SessionPermission {
                task_id,
                request_id,
                outcome,
                reply,
            } => {
                // First answer wins. A stale answer — a second tap, or a banner
                // answered after the in-app prompt — must not reach the agent
                // or rewrite the outcome the transcript already shows.
                match self
                    .pending_permissions
                    .resolve(&task_id, &request_id, &outcome)
                {
                    Ok(()) => {
                        let daemon_ask = self
                            .pending_permissions
                            .answer_daemon_ask(&request_id, &outcome);
                        if let Some(handle) = self.sessions.get(&task_id).filter(|_| !daemon_ask) {
                            handle.answer(request_id.clone(), outcome.clone());
                        }
                        self.emit_session(
                            &task_id,
                            wire::SessionUpdate::PermissionResolved {
                                request_id,
                                outcome,
                            },
                        );
                        let _ = reply.send(Ok(()));
                    }
                    Err(error) => {
                        let _ = reply.send(Err(error));
                    }
                }
            }
            Command::SessionSetConfigOption {
                task_id,
                config_id,
                value,
                reply,
            } => {
                let cmd_tx = self.cmd_tx.clone();
                match self.sessions.get(&task_id).cloned() {
                    Some(handle) => {
                        // The agent round-trip can take seconds; don't hold the
                        // actor loop hostage waiting for it. The verdict is
                        // routed back as a command so the actor can record it.
                        tokio::spawn(async move {
                            let result = handle
                                .set_config_option(config_id.clone(), value.clone())
                                .await;
                            let _ = reply.send(result.clone());
                            let _ = cmd_tx
                                .send(Command::SessionConfigOptionResult {
                                    task_id,
                                    config_id,
                                    value,
                                    result,
                                })
                                .await;
                        });
                    }
                    None => {
                        let _ = reply.send(Err(
                            "this task has no running agent session to configure".into(),
                        ));
                    }
                }
            }
            Command::SessionConfigOptionResult {
                task_id,
                config_id,
                value,
                result,
            } => {
                let is_model = self.tasks.get(&task_id).is_some_and(|task| {
                    task.config_options
                        .iter()
                        .find(|o| o.id == config_id)
                        .is_some_and(crate::daemon::acp::is_model_selector)
                });
                let Some(task) = self.tasks.get_mut(&task_id) else {
                    return;
                };
                match (&result, is_model) {
                    (Ok(()), true) => {
                        // The agent accepted the switch to the model selector:
                        // that is the task's durable model intent, and any
                        // earlier mismatch no longer describes reality.
                        if task.model.as_deref() != Some(value.as_str()) {
                            task.model = Some(value);
                        }
                        task.blocked_reason = None;
                        task.blocked_kind = None;
                        let updated = task.clone();
                        self.persist(&updated);
                        self.emit(Event::TaskUpdated(updated));
                    }
                    (Err(error), true) => {
                        // The user asked for a model and the agent said no (or
                        // never answered). Record it durably — the session
                        // keeps running on the old model, and the user must be
                        // able to see that later, not just in the toast.
                        task.blocked_reason =
                            Some(format!("Model '{value}' was not applied: {error}"));
                        task.blocked_kind = Some(wire::TaskBlockedKind::ModelMismatch);
                        let updated = task.clone();
                        self.persist(&updated);
                        self.emit(Event::TaskUpdated(updated));
                    }
                    _ => {}
                }
            }
            Command::AskUser {
                task_id,
                title,
                browser_origin,
                reply,
            } => self.ask_user(task_id, title, browser_origin, reply),
            Command::WithdrawAsk {
                task_id,
                request_id,
            } => self.withdraw_ask(task_id, request_id),

            other => self.handle_advisor_command(other).await,
        }
    }
}

/// A session a task already runs is listed as that task, not again as one
/// to continue from outside the app.
fn outside_sessions(
    mut sessions: Vec<wire::ExternalSession>,
    owned: &HashSet<String>,
) -> Vec<wire::ExternalSession> {
    sessions.retain(|session| !owned.contains(&session.session_id));
    sessions
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(id: &str) -> wire::ExternalSession {
        wire::ExternalSession {
            agent: "codex".into(),
            session_id: id.into(),
            title: String::new(),
            updated_at: 0,
            message_count: 0,
        }
    }

    #[test]
    fn a_task_session_is_not_listed_as_outside() {
        let owned = HashSet::from(["mine".to_string()]);
        let left = outside_sessions(vec![session("mine"), session("theirs")], &owned);
        assert_eq!(
            left.iter()
                .map(|s| s.session_id.as_str())
                .collect::<Vec<_>>(),
            ["theirs"]
        );
    }
}
