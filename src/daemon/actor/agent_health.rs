//! Per-agent install health: whether the last background probe, session start
//! or install verification hit a broken-install signature.

use warpforge_protocol as wire;

use crate::daemon::actor::{Daemon, Event};

impl Daemon {
    /// Mark `id` broken only for a broken-install signature; an auth error or
    /// a timeout says nothing about the install and leaves health untouched.
    pub(crate) fn note_agent_failure(&mut self, id: &str, text: &str) {
        if !crate::daemon::agents::broken_install(text) {
            return;
        }
        let detail = text.to_string();
        let summary =
            crate::daemon::agents::broken_install_summary(text).unwrap_or_else(|| detail.clone());
        let broken = wire::AgentBrokenInstall { summary, detail };
        self.agent_health.insert(id.to_string(), broken.clone());
        self.emit(Event::AgentHealthUpdated {
            id: id.to_string(),
            broken: Some(broken),
        });
    }

    /// Clear `id`'s tracked health after a successful probe or session start.
    /// A no-op when it was already healthy, so a healthy agent does not spam
    /// clients with redundant events.
    pub(crate) fn clear_agent_health(&mut self, id: &str) {
        if self.agent_health.remove(id).is_some() {
            self.emit(Event::AgentHealthUpdated {
                id: id.to_string(),
                broken: None,
            });
        }
    }
}
