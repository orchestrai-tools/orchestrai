use std::sync::Arc;

use warpforge_protocol as wire;

use crate::daemon::actor::{AgentProbeContext, Command, Daemon, Event};
use crate::daemon::runtime::Write as PersistWrite;

impl Daemon {
    /// The command, cwd and account env a probe for `id` would spawn. The
    /// configured command when the agent is configured, else its registry
    /// default; the first project's path (the probe cache is global per agent,
    /// so any project is representative); the active account's environment.
    pub(crate) fn agent_probe_context(&self, id: &str) -> Option<AgentProbeContext> {
        let acp_command = self
            .configured_agents
            .iter()
            .find(|a| a.id == id)
            .map(|a| a.acp_command.clone())
            .or_else(|| {
                crate::daemon::agents::known_agent(id)
                    .map(|agent| agent.default_acp_command.to_string())
            })?;
        let cwd = self
            .projects
            .first()
            .map(|p| std::path::PathBuf::from(&p.path))
            .unwrap_or_else(|| {
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."))
            });
        let env = self.resolve_agent_env(id, crate::daemon::accounts::SpawnAccount::Active);
        Some(AgentProbeContext {
            acp_command,
            cwd,
            env,
        })
    }

    pub(crate) async fn handle_agent_command(&mut self, cmd: Command) {
        match cmd {
            Command::SpawnAgent {
                project,
                command,
                description,
                cols,
                rows,
                task_id,
                reply,
            } => {
                let Some(root) = self.project_path(&project) else {
                    let _ = reply.send(Err(anyhow::anyhow!("unknown project: {project}")));
                    return;
                };
                // A task_id from another project must not pick its worktree:
                // fall back to this project's root.
                let worktree = task_id
                    .as_deref()
                    .and_then(|id| self.tasks.get(id))
                    .filter(|task| task.project == project)
                    .and_then(|task| task.worktree.clone());
                let path =
                    crate::daemon::actor::project::resolve_terminal_cwd(&root, worktree.as_deref());
                let result =
                    self.agents
                        .spawn(&project, &path, &command, &description, cols, rows, task_id);
                if let Ok(ref id) = result {
                    if let Some(agent) = self.agents.get(id) {
                        self.emit(Event::AgentSpawned {
                            id: id.clone(),
                            project: project.clone(),
                            screen: Arc::clone(&agent.screen),
                        });
                        let (cols, rows) = agent.dims();
                        self.emit(Event::TerminalSpawned {
                            info: wire::TerminalInfo {
                                id: id.clone(),
                                project: project.clone(),
                                command: agent.command.clone(),
                                started_at: agent.started_at,
                                cols,
                                rows,
                                task_id: agent.task_id.clone(),
                            },
                        });
                    }
                }
                let _ = reply.send(result);
            }
            Command::WriteAgent { id, data } => self.agents.write(&id, data),
            Command::ResizeAgent { id, cols, rows } => self.agents.resize(&id, cols, rows),
            Command::KillAgent { id } => {
                self.agents.kill(&id);
                self.emit(Event::AgentExited { id });
            }

            Command::DetectAgents { reply } => {
                // Detection shells out (which/npm) and hits the registry, so run
                // it off the actor loop rather than blocking command handling.
                tokio::spawn(async move {
                    let detected = crate::daemon::agents::detect_agents().await;
                    let _ = reply.send(detected);
                });
            }
            Command::UpdateAgents { agents } => {
                self.persist.write(PersistWrite::Agents(agents.clone()));
                self.configured_agents = agents.clone();
                self.emit(Event::AgentsUpdated {
                    agents: self.configured_agents.clone(),
                });
                // Probe any newly-enabled agent without cached models.
                let probe_ids: Vec<String> = self
                    .configured_agents
                    .iter()
                    .filter(|a| a.enabled && a.models.is_empty())
                    .map(|a| a.id.clone())
                    .collect();
                for id in probe_ids {
                    let _ = self
                        .cmd_tx
                        .send(Command::ProbeAgent { id, reply: None })
                        .await;
                }
            }

            Command::ProbeAgent { id, reply } => {
                let enabled = self
                    .configured_agents
                    .iter()
                    .any(|a| a.id == id && a.enabled);
                let Some(context) = self.agent_probe_context(&id).filter(|_| enabled) else {
                    if let Some(reply) = reply {
                        let _ = reply.send(Err(format!("no enabled agent '{id}'")));
                    }
                    return;
                };
                let agent_id = id.clone();
                let cmd_tx = self.cmd_tx.clone();
                tokio::spawn(async move {
                    let res = crate::daemon::agent_probe::probe_models(
                        &context.acp_command,
                        &context.cwd,
                        &context.env.set,
                        &context.env.remove,
                    )
                    .await;
                    let outcome = match res {
                        Ok(models) => {
                            let _ = cmd_tx
                                .send(Command::AgentProbed {
                                    id: agent_id,
                                    models,
                                })
                                .await;
                            Ok(())
                        }
                        Err(e) => {
                            eprintln!("[daemon] ACP probe failed for agent '{agent_id}': {e}");
                            Err(format!("could not read models from {agent_id}: {e}"))
                        }
                    };
                    if let Some(reply) = reply {
                        let _ = reply.send(outcome);
                    }
                });
            }
            Command::AgentProbeContext { id, reply } => {
                let _ = reply.send(self.agent_probe_context(&id));
            }
            Command::AgentProbed { id, models } => {
                // A probe that came back with nothing means the agent answered
                // without advertising selectors — treat it as "no news" rather
                // than truth, or one flaky probe would wipe a working list and
                // leave the picker empty until the next restart.
                if models.is_empty() {
                    return;
                }
                if let Some(agent) = self.configured_agents.iter_mut().find(|a| a.id == id) {
                    agent.models = models.clone();
                    // last_model is deliberately untouched: it may have been
                    // picked explicitly while the probe was in flight.
                    self.persist.write(PersistWrite::AgentModels {
                        id: id.clone(),
                        models: models.clone(),
                        last_model: agent.last_model.clone(),
                    });
                }
                self.emit(Event::AgentsUpdated {
                    agents: self.configured_agents.clone(),
                });
            }

            other => self.handle_task_command(other).await,
        }
    }
}
