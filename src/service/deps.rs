//! `dependsOn` gating: a dependent is held as a process-less `Starting`
//! placeholder until every dependency is ready, and fails if one does not.
//! A dependent failed that way keeps its dependencies and starts if they recover.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use super::{ManagedService, ServiceManager, ServiceStatus};

/// What a dependency currently means for a service waiting on it.
#[derive(Debug, Clone, PartialEq)]
pub enum DepState {
    Ready,
    Pending,
    /// The dependency will not become ready; the text completes "dependency x …".
    Unavailable(String),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Gate {
    Go,
    Wait,
    Fail(String),
}

/// Decide whether a service may start given its dependencies' states. An
/// unavailable dependency fails the gate even while others are still pending.
pub fn dependency_gate(deps: &[String], state: impl Fn(&str) -> DepState) -> Gate {
    let mut pending = false;
    for dep in deps {
        match state(dep) {
            DepState::Ready => {}
            DepState::Pending => pending = true,
            DepState::Unavailable(why) => {
                return Gate::Fail(format!("did not start: dependency {dep} {why}"))
            }
        }
    }
    if pending {
        Gate::Wait
    } else {
        Gate::Go
    }
}

impl ServiceManager {
    /// Record a service as waiting on `deps` without spawning anything.
    pub fn mark_waiting(
        &mut self,
        project_name: &str,
        service_name: &str,
        command: &str,
        deps: Vec<String>,
    ) {
        let key = format!("{project_name}/{service_name}");
        let run_id = self.next_run_id;
        self.next_run_id = self.next_run_id.saturating_add(1);
        let existing_logs = self
            .services
            .get(&key)
            .map(|s| s.logs.clone())
            .unwrap_or_default();
        let next_seq = existing_logs
            .last()
            .map(|l| l.seq.saturating_add(1))
            .unwrap_or(0);
        let mut managed = ManagedService {
            name: service_name.to_string(),
            project_name: project_name.to_string(),
            command: command.to_string(),
            status: ServiceStatus::Starting,
            logs: existing_logs,
            next_seq,
            original_port: 0,
            allocated_port: 0,
            port_pinned: false,
            pgid: None,
            run_id,
            waiting_on: Vec::new(),
            stopping: Arc::new(AtomicBool::new(false)),
        };
        managed.push_log(format!("[service waiting for {}]", deps.join(", ")));
        managed.waiting_on = deps;
        self.services.insert(key, managed);
    }

    /// Fail a service that will not be started, recording `message` as the reason.
    pub fn fail_start(
        &mut self,
        project_name: &str,
        service_name: &str,
        command: &str,
        message: String,
    ) {
        let key = format!("{project_name}/{service_name}");
        self.record_start_failure(&key, project_name, service_name, command, message);
    }

    /// Fail a service whose dependency will not be ready, but keep `deps` so
    /// it still starts if they all become ready later.
    pub fn fail_waiting(
        &mut self,
        project_name: &str,
        service_name: &str,
        command: &str,
        message: String,
        deps: Vec<String>,
    ) {
        self.fail_start(project_name, service_name, command, message);
        if let Some(svc) = self.get_mut(project_name, service_name) {
            svc.waiting_on = deps;
        }
    }

    /// Services of a project held on dependencies: `(name, deps, failed)`.
    /// A failed one was refused because a dependency was not ready.
    pub fn waiting_in_project(&self, project_name: &str) -> Vec<(String, Vec<String>, bool)> {
        let mut waiting: Vec<_> = self
            .services
            .values()
            .filter(|s| {
                s.project_name == project_name
                    && matches!(s.status, ServiceStatus::Starting | ServiceStatus::Failed)
                    && !s.waiting_on.is_empty()
            })
            .map(|s| {
                let failed = s.status == ServiceStatus::Failed;
                (s.name.clone(), s.waiting_on.clone(), failed)
            })
            .collect();
        waiting.sort();
        waiting
    }
}
