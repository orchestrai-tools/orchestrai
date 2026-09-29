//! Starting a forward because a service `dependsOn` it: when something on this
//! machine already accepts connections on the forward's local port, that
//! server is used and no forward is started.

use std::future::Future;
use std::sync::Arc;

use tokio::sync::{mpsc, Notify};

use super::{ManagedPortForward, PfEvent, PfStatus};
use crate::service::DepState;

/// Report `local_port` as served locally when `probe` finds it answering,
/// else run `forward`.
///
/// @param project the forward's project
/// @param name the forward's label
/// @param local_port the port the forward would bind
/// @param event_tx where `PfEvent::ServedLocally` is sent
/// @param stop ends the probe early when the forward is stopped
/// @param probe resolves to whether `local_port` accepts a connection
/// @param forward the forward's watcher, run only when the port is not served
pub(super) async fn serve_for_dependent(
    project: String,
    name: String,
    local_port: u16,
    event_tx: mpsc::UnboundedSender<PfEvent>,
    stop: Arc<Notify>,
    probe: impl Future<Output = bool>,
    forward: impl Future<Output = ()>,
) {
    let served = tokio::select! {
        served = probe => served,
        _ = stop.notified() => return,
    };
    if served {
        let _ = event_tx.send(PfEvent::ServedLocally {
            project,
            name,
            local_port,
        });
    } else {
        forward.await;
    }
}

impl ManagedPortForward {
    /// What this forward means for a service that `dependsOn` it.
    pub fn dependency_state(&self) -> DepState {
        match self.status {
            PfStatus::Active => DepState::Ready,
            PfStatus::Stopped if self.served_locally => DepState::Ready,
            PfStatus::Starting | PfStatus::Restarting => DepState::Pending,
            PfStatus::Failed => DepState::Unavailable(match &self.failure {
                Some(reason) => format!("failed: {reason}"),
                None => "failed".to_string(),
            }),
            PfStatus::Stopped => DepState::Unavailable("is stopped".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicBool, Ordering};

    use super::*;
    use crate::config::PortForwardConfig;
    use crate::portforward::PortForwardManager;

    async fn decide(served: bool) -> (Option<PfEvent>, bool) {
        let (tx, mut rx) = mpsc::unbounded_channel();
        let ran = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&ran);
        serve_for_dependent(
            "p".into(),
            "tunnel".into(),
            8123,
            tx,
            Arc::new(Notify::new()),
            async move { served },
            async move { flag.store(true, Ordering::SeqCst) },
        )
        .await;
        (rx.try_recv().ok(), ran.load(Ordering::SeqCst))
    }

    #[tokio::test]
    async fn a_served_port_is_used_and_the_forward_is_not_started() {
        let (event, forwarded) = decide(true).await;
        assert!(
            matches!(
                event,
                Some(PfEvent::ServedLocally {
                    local_port: 8123,
                    ..
                })
            ),
            "{event:?}"
        );
        assert!(!forwarded);
    }

    #[tokio::test]
    async fn a_port_nobody_serves_starts_the_forward() {
        let (event, forwarded) = decide(false).await;
        assert!(event.is_none(), "{event:?}");
        assert!(forwarded);
    }

    fn manager_with_tunnel() -> PortForwardManager {
        let (tx, _rx) = mpsc::unbounded_channel();
        let mut manager = PortForwardManager::new(tx);
        let cfg = PortForwardConfig {
            name: Some("tunnel".into()),
            namespace: "dev".into(),
            pod: "clickhouse".into(),
            local_port: 8123,
            remote_port: 8123,
        };
        manager.insert_starting("p", &cfg);
        manager
    }

    fn tunnel(manager: &PortForwardManager) -> &ManagedPortForward {
        &manager.forwards["p/tunnel"]
    }

    #[test]
    fn a_locally_served_forward_satisfies_its_dependents_while_stopped() {
        let mut manager = manager_with_tunnel();
        assert_eq!(tunnel(&manager).dependency_state(), DepState::Pending);
        manager.apply_event(PfEvent::ServedLocally {
            project: "p".into(),
            name: "tunnel".into(),
            local_port: 8123,
        });
        let pf = tunnel(&manager);
        assert_eq!(pf.status, PfStatus::Stopped);
        assert_eq!(pf.dependency_state(), DepState::Ready);
        assert!(
            pf.logs
                .iter()
                .any(|l| l.line.contains("already served locally")),
            "{:?}",
            pf.logs
        );
    }

    #[test]
    fn a_forward_failed_on_a_busy_port_names_the_port_to_its_dependents() {
        let mut manager = manager_with_tunnel();
        manager.apply_event(PfEvent::Failed {
            project: "p".into(),
            name: "tunnel".into(),
            local_port: 8123,
            reason: super::super::watch::busy_port_reason(8123),
        });
        let DepState::Unavailable(why) = tunnel(&manager).dependency_state() else {
            panic!("a failed forward is unavailable");
        };
        assert!(
            why.contains("port 8123 is in use by another process"),
            "{why}"
        );
    }

    #[test]
    fn a_late_served_report_does_not_override_a_stopped_forward() {
        let mut manager = manager_with_tunnel();
        manager.stop("p", "tunnel");
        manager.apply_event(PfEvent::ServedLocally {
            project: "p".into(),
            name: "tunnel".into(),
            local_port: 8123,
        });
        assert_eq!(
            tunnel(&manager).dependency_state(),
            DepState::Unavailable("is stopped".to_string())
        );
    }
}
