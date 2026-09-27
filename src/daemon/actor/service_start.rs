//! Starting declared services in `dependsOn` order: a dependent is spawned
//! only once its dependencies are ready, and fails if one of them does not
//! come up. A dependent failed that way still starts if its dependencies recover.
//! Readiness arrives as service/port-forward events; nothing here waits.

use std::collections::HashSet;
use std::path::Path;

use crate::config::{load_workspace_config, sorted_services, ServiceConfig, WorkspaceConfig};
use crate::portforward::PfStatus;
use crate::service::{dependency_gate, DepState, Gate, Readiness, ServiceStatus};

use crate::daemon::actor::Daemon;

impl Daemon {
    /// Start every declared service for a project (no port-forwards).
    pub(crate) async fn start_services(&mut self, name: &str) {
        let Some((path, config)) = self.project_config(name) else {
            return;
        };
        for svc_name in sorted_services(&config) {
            self.launch_service(name, &path, &config, &svc_name).await;
        }
    }

    /// Start one service, and any of its dependencies that are not up yet.
    pub(crate) async fn start_one_service(&mut self, project: &str, service: &str) {
        let Some((path, config)) = self.project_config(project) else {
            return;
        };
        let needed = dependency_closure(&config, service);
        for svc_name in sorted_services(&config) {
            if needed.contains(&svc_name) {
                self.launch_service(project, &path, &config, &svc_name)
                    .await;
            }
        }
    }

    /// Re-check every service of `project` that waits on dependencies: spawn
    /// the ones whose dependencies are all ready, fail the ones whose
    /// dependencies will not be.
    pub(crate) async fn advance_waiting(&mut self, project: &str) {
        let waiting = self.services.waiting_in_project(project);
        if waiting.is_empty() {
            return;
        }
        let Some((path, config)) = self.project_config(project) else {
            return;
        };
        for (name, deps, failed) in waiting {
            let Some(svc) = config.services.get(&name) else {
                continue;
            };
            match dependency_gate(&deps, |dep| self.dependency_state(project, dep)) {
                Gate::Go => self.spawn_declared(project, &path, &name, svc).await,
                Gate::Fail(reason) if !failed => {
                    self.services
                        .fail_waiting(project, &name, &svc.command, reason, deps)
                }
                Gate::Wait | Gate::Fail(_) => continue,
            }
            self.emit_service_status(project, &name);
        }
    }

    async fn launch_service(
        &mut self,
        project: &str,
        path: &str,
        config: &WorkspaceConfig,
        name: &str,
    ) {
        let Some(svc) = config.services.get(name) else {
            return;
        };
        let live = self
            .services
            .get(project, name)
            .is_some_and(|s| matches!(s.status, ServiceStatus::Starting | ServiceStatus::Running));
        if live {
            return;
        }
        let forwards: Vec<_> = config
            .portforwards
            .iter()
            .filter(|pf| {
                let label = pf
                    .name
                    .clone()
                    .unwrap_or_else(|| format!("{}:{}", pf.namespace, pf.pod));
                svc.depends_on.contains(&label)
            })
            .cloned()
            .collect();
        if !forwards.is_empty() {
            self.portforwards.start_all(project, &forwards).await;
        }

        let cycle = in_dependency_cycle(config, name);
        let gate = if cycle {
            Gate::Fail("did not start: its dependsOn chain is a cycle".to_string())
        } else {
            dependency_gate(&svc.depends_on, |dep| self.dependency_state(project, dep))
        };
        match gate {
            Gate::Go => self.spawn_declared(project, path, name, svc).await,
            Gate::Wait => {
                self.services
                    .mark_waiting(project, name, &svc.command, svc.depends_on.clone())
            }
            Gate::Fail(reason) if cycle => {
                self.services
                    .fail_start(project, name, &svc.command, reason)
            }
            Gate::Fail(reason) => self.services.fail_waiting(
                project,
                name,
                &svc.command,
                reason,
                svc.depends_on.clone(),
            ),
        }
        self.emit_service_status(project, name);
    }

    async fn spawn_declared(&mut self, project: &str, path: &str, name: &str, svc: &ServiceConfig) {
        let pin = self.port_pin_for(project, svc);
        let blocker = self.start_blocker_for(project);
        let range = self.port_range_for(project).unwrap_or((4000, 4099));
        let started = self
            .services
            .start(
                project,
                path,
                range,
                pin,
                name,
                &svc.command,
                svc.port.unwrap_or(0),
                svc.env.as_ref(),
                &Readiness::from_config(svc),
                blocker.as_deref(),
            )
            .await;
        if let Err(error) = started {
            self.services.fail_start(
                project,
                name,
                &svc.command,
                format!("could not spawn: {error}"),
            );
        }
    }

    fn dependency_state(&self, project: &str, dep: &str) -> DepState {
        if let Some(svc) = self.services.get(project, dep) {
            return match svc.status {
                ServiceStatus::Running => DepState::Ready,
                ServiceStatus::Starting => DepState::Pending,
                ServiceStatus::Failed => DepState::Unavailable("failed".to_string()),
                ServiceStatus::Stopped => DepState::Unavailable("is stopped".to_string()),
            };
        }
        let key = format!("{project}/{dep}");
        match self.portforwards.forwards.get(&key).map(|pf| &pf.status) {
            Some(PfStatus::Active) => DepState::Ready,
            Some(PfStatus::Starting | PfStatus::Restarting) => DepState::Pending,
            Some(PfStatus::Failed) => DepState::Unavailable("failed".to_string()),
            Some(PfStatus::Stopped) => DepState::Unavailable("is stopped".to_string()),
            // Undeclared names are reported by config validation, not enforced here.
            None => DepState::Ready,
        }
    }

    fn project_config(&self, project: &str) -> Option<(String, WorkspaceConfig)> {
        let path = self.project_path(project)?;
        let config = load_workspace_config(Path::new(&path))?;
        Some((path, config))
    }
}

/// `service` plus every service it transitively depends on.
fn dependency_closure(config: &WorkspaceConfig, service: &str) -> HashSet<String> {
    let mut seen = HashSet::new();
    let mut stack = vec![service.to_string()];
    while let Some(name) = stack.pop() {
        if !seen.insert(name.clone()) {
            continue;
        }
        if let Some(svc) = config.services.get(&name) {
            stack.extend(svc.depends_on.iter().cloned());
        }
    }
    seen
}

fn in_dependency_cycle(config: &WorkspaceConfig, service: &str) -> bool {
    let Some(svc) = config.services.get(service) else {
        return false;
    };
    svc.depends_on
        .iter()
        .any(|dep| dependency_closure(config, dep).contains(service))
}
