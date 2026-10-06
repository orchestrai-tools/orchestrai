//! Applying port-forward watcher events and re-checking the services that
//! depend on a forward whenever its status changes.

use crate::daemon::actor::config_observer::split_key;
use crate::daemon::actor::{Daemon, Event};
use crate::portforward::{PfEvent, PfStatus};

impl Daemon {
    pub(crate) async fn handle_pf_event(&mut self, ev: PfEvent) {
        let key = format!("{}/{}", ev.project(), ev.name());
        let next_seq = self
            .portforwards
            .forwards
            .get(&key)
            .map_or(0, |pf| pf.next_seq);
        let broadcast = match &ev {
            PfEvent::Log {
                project,
                name,
                line,
            } => Event::PortForwardLog {
                project: project.clone(),
                name: name.clone(),
                seq: next_seq,
                line: line.clone(),
            },
            PfEvent::Active { project, name, .. } | PfEvent::Restarted { project, name, .. } => {
                Event::PortForwardStatus {
                    project: project.clone(),
                    name: name.clone(),
                    status: PfStatus::Active,
                }
            }
            PfEvent::Failed { project, name, .. } => Event::PortForwardStatus {
                project: project.clone(),
                name: name.clone(),
                status: PfStatus::Failed,
            },
            PfEvent::ServedLocally { project, name, .. } => Event::PortForwardStatus {
                project: project.clone(),
                name: name.clone(),
                status: PfStatus::Stopped,
            },
        };
        let status_changed = !matches!(ev, PfEvent::Log { .. });
        let project = ev.project().to_string();
        let served_locally = matches!(ev, PfEvent::ServedLocally { .. })
            && self
                .portforwards
                .forwards
                .get(&key)
                .is_some_and(|pf| pf.status == PfStatus::Starting);
        self.portforwards.apply_event(ev);
        if self.portforwards.forwards.contains_key(&key) {
            self.emit(broadcast);
        }
        if served_locally {
            self.note_served_locally(&key);
        }
        if status_changed {
            self.advance_waiting(&project).await;
        }
    }

    /// Tell the forward's log and each service waiting on it that the forward
    /// was not started because its local port is already served.
    fn note_served_locally(&mut self, key: &str) {
        let Some(pf) = self.portforwards.forwards.get(key) else {
            return;
        };
        let (project, name) = split_key(key);
        if let Some(line) = pf.logs.last() {
            self.emit(Event::PortForwardLog {
                project: project.clone(),
                name: name.clone(),
                seq: line.seq,
                line: line.line.clone(),
            });
        }
        let note = format!(
            "[dependency {name}: port {} is already served locally — using it instead of starting the forward]",
            pf.local_port
        );
        let waiting: Vec<String> = self
            .services
            .waiting_in_project(&project)
            .into_iter()
            .filter(|(_, deps, _)| deps.contains(&name))
            .map(|(service, _, _)| service)
            .collect();
        for service in waiting {
            let Some(svc) = self.services.get_mut(&project, &service) else {
                continue;
            };
            let seq = svc.next_seq;
            svc.push_log(note.clone());
            self.emit(Event::ServiceLog {
                project: project.clone(),
                service,
                seq,
                line: note.clone(),
            });
        }
    }
}
