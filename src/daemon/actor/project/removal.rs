use crate::daemon::actor::event::ProjectLiveResources;
use crate::daemon::actor::{Daemon, Event, ProjectRemovalError};
use crate::daemon::task::TaskStatus;
use crate::daemon::workflow::WorkflowOutcome;
use crate::portforward::PfStatus;
use crate::service::{kill_listeners_on_ports, ServiceStatus};

impl Daemon {
    /// Stop and forget all project-owned runtime resources, then unregister the
    /// project. The actor serializes this operation so starts cannot interleave.
    pub(crate) async fn remove_project(
        &mut self,
        name: &str,
        stop_resources: bool,
    ) -> Result<(), ProjectRemovalError> {
        let Some(_) = self
            .projects
            .iter()
            .position(|project| project.name == name)
        else {
            return Err(ProjectRemovalError::NotFound(format!(
                "Project \"{name}\" is not registered"
            )));
        };

        let task_ids: Vec<String> = self
            .tasks
            .values()
            .filter(|task| task.project == name)
            .map(|task| task.id.clone())
            .collect();
        let live = ProjectLiveResources {
            sessions: task_ids
                .iter()
                .filter(|id| {
                    self.sessions
                        .get(*id)
                        .is_some_and(|session| session.is_alive())
                        || self.pending_session_starts.contains_key(*id)
                        || self.pending_resume.contains_key(*id)
                        || self.pending_workflow_starts.contains_key(*id)
                        || self.workflow_is_active(id)
                })
                .count(),
            services: self
                .services
                .list_for_project(name)
                .iter()
                .filter(|service| {
                    service.process_alive()
                        || matches!(
                            service.status,
                            ServiceStatus::Starting | ServiceStatus::Running
                        )
                })
                .count(),
            portforwards: self
                .portforwards
                .list_for_project(name)
                .iter()
                .filter(|forward| {
                    matches!(
                        forward.status,
                        PfStatus::Starting | PfStatus::Active | PfStatus::Restarting
                    )
                })
                .count(),
            terminals: self
                .agents
                .list_for_project(name)
                .iter()
                .filter(|agent| agent.status.is_live_terminal())
                .count(),
        };
        if live.any() && !stop_resources {
            return Err(ProjectRemovalError::Conflict(live.conflict_message(name)));
        }

        self.stop_project_tasks(name).await?;

        let service_names: Vec<String> = self
            .services
            .list_for_project(name)
            .into_iter()
            .map(|service| service.name.clone())
            .collect();
        for service in service_names {
            self.services
                .remove(name, &service)
                .await
                .map_err(|error| {
                    ProjectRemovalError::Internal(format!(
                        "Failed to stop service \"{service}\" for project \"{name}\": {error}"
                    ))
                })?;
        }

        let portforward_names: Vec<String> = self
            .portforwards
            .list_for_project(name)
            .into_iter()
            .map(|forward| forward.name.clone())
            .collect();
        for forward in portforward_names {
            self.portforwards.remove(name, &forward);
        }

        // Only ports this daemon handed out — a declared range can hold
        // processes warpforge never started (ADR 0006 invariant 3).
        if stop_resources {
            if let Some(range) = self.port_range_for(name) {
                kill_listeners_on_ports(&crate::ports::allocated_in_ranges(&[range])).await;
            }
        }

        let terminal_ids: Vec<String> = self
            .agents
            .list_for_project(name)
            .into_iter()
            .map(|agent| agent.id.clone())
            .collect();
        for id in terminal_ids {
            self.agents.kill(&id);
            self.emit(Event::AgentExited { id });
        }

        crate::registry::remove_project(name).map_err(|error| {
            ProjectRemovalError::Internal(format!(
                "Resources were stopped, but project registration removal failed: {error}"
            ))
        })?;

        self.projects.retain(|p| p.name != name);
        self.config_observer.untrack(name);
        self.port_ranges.remove(name);
        // Removing a project frees its range; relocated neighbours must be
        // broadcast, not just the removal itself.
        let affected = self.recompute_port_ranges();

        self.emit(Event::ProjectRemoved {
            name: name.to_string(),
        });
        self.broadcast_project_config(&affected);

        Ok(())
    }

    /// Stop pipelines before their children so no completion can launch another stage.
    async fn stop_project_tasks(&mut self, project: &str) -> Result<(), ProjectRemovalError> {
        self.runner_stop(project)
            .await
            .map_err(ProjectRemovalError::Internal)?;
        let task_ids: Vec<String> = self
            .tasks
            .values()
            .filter(|task| task.project == project)
            .map(|task| task.id.clone())
            .collect();
        for id in &task_ids {
            if self.workflow_is_active(id) {
                self.workflow_finalize(id, WorkflowOutcome::Stopped)
                    .await
                    .map_err(ProjectRemovalError::Internal)?;
            }
        }
        let mut stopped = Vec::new();
        for id in &task_ids {
            self.pending_session_starts.remove(id);
            self.blocked_starts.remove(id);
            self.pending_workflow_starts.remove(id);
            self.pending_resume.remove(id);
            self.resume_replay.remove(id);
            self.pending_wake.remove(id);
            self.drop_pending_permissions(id);
            if let Some(handle) = self.sessions.remove(id) {
                handle.cancel();
                stopped.push(handle);
            }
            if let Some(task) = self.tasks.get_mut(id) {
                if matches!(task.status, TaskStatus::Running | TaskStatus::Queued) {
                    task.set_status(TaskStatus::Interrupted);
                    let updated = task.clone();
                    self.persist(&updated);
                    self.emit(Event::TaskUpdated(updated));
                }
            }
        }
        // Signal every session before waiting, and acknowledge only reaped processes.
        for handle in stopped {
            handle.cancel_and_wait().await.map_err(|error| {
                ProjectRemovalError::Internal(format!(
                    "Could not stop the project's agent session: {error}"
                ))
            })?;
        }
        Ok(())
    }
}
