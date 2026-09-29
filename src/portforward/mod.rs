use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Notify};

use crate::config::PortForwardConfig;
use crate::service::{now_ms, port_answers, LogLine};

mod local;
mod stale;
mod watch;

use watch::watch_portforward;

#[derive(Debug, Clone, PartialEq)]
#[allow(dead_code)]
pub enum PfStatus {
    Starting,
    Active,
    Restarting,
    Failed,
    Stopped,
}

impl std::fmt::Display for PfStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PfStatus::Starting => write!(f, "starting"),
            PfStatus::Active => write!(f, "active"),
            PfStatus::Restarting => write!(f, "restarting"),
            PfStatus::Failed => write!(f, "failed"),
            PfStatus::Stopped => write!(f, "stopped"),
        }
    }
}

/// Port-forward watcher events. Every variant carries `project` so events can
/// be attributed correctly regardless of which project a client happens to be
/// viewing — the daemon has many simultaneous observers, so "the active
/// project" is not a safe key. (Audit fix: previously attribution was done by
/// the TUI against whatever screen was open, dropping events on the dashboard
/// and misattributing them across project switches.)
#[derive(Debug, Clone)]
pub enum PfEvent {
    Active {
        project: String,
        name: String,
        local_port: u16,
    },
    Restarted {
        project: String,
        name: String,
        local_port: u16,
    },
    Failed {
        project: String,
        name: String,
        local_port: u16,
        reason: String,
    },
    /// Something local already answers on the port a dependent's forward needs.
    ServedLocally {
        project: String,
        name: String,
        local_port: u16,
    },
    Log {
        project: String,
        name: String,
        line: String,
    },
}

impl PfEvent {
    pub fn project(&self) -> &str {
        match self {
            PfEvent::Active { project, .. }
            | PfEvent::Restarted { project, .. }
            | PfEvent::Failed { project, .. }
            | PfEvent::ServedLocally { project, .. }
            | PfEvent::Log { project, .. } => project,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            PfEvent::Active { name, .. }
            | PfEvent::Restarted { name, .. }
            | PfEvent::Failed { name, .. }
            | PfEvent::ServedLocally { name, .. }
            | PfEvent::Log { name, .. } => name,
        }
    }
}

pub struct ManagedPortForward {
    pub name: String,
    #[allow(dead_code)]
    pub namespace: String,
    #[allow(dead_code)]
    pub pod_prefix: String,
    pub local_port: u16,
    #[allow(dead_code)]
    pub remote_port: u16,
    pub status: PfStatus,
    pub last_event: Option<String>,
    /// Left stopped because a local server already answers on `local_port`.
    pub served_locally: bool,
    /// Why the forward gave up, when it is `Failed`.
    pub failure: Option<String>,
    /// Captured kubectl stdout + stderr + internal diagnostics
    pub logs: Vec<LogLine>,
    /// Sequence number for the next appended log line (see `service::LogLine`).
    pub next_seq: u64,
    /// Notifying this asks the watcher task to kill its kubectl child and exit
    /// — scoped teardown, so we never kill port-forwards we didn't start.
    stop: Arc<Notify>,
}

impl ManagedPortForward {
    /// Append a retained line (assigning its seq + timestamp) and trim the ring.
    fn push_log(&mut self, line: String) {
        let seq = self.next_seq;
        self.next_seq = self.next_seq.saturating_add(1);
        self.logs.push(LogLine {
            seq,
            at_ms: now_ms(),
            line,
        });
        if self.logs.len() > 500 {
            self.logs.drain(..self.logs.len() - 500);
        }
    }

    /// Slice the ring by seq cursor and cap to `limit`; returns raw lines, their
    /// timestamps (millis, index-aligned), and the cursor to pass back as `after`.
    /// `after` is inclusive ("start from this seq"), so `0` returns the oldest
    /// retained line and polling with the returned cursor returns only newer ones.
    pub fn window(&self, after: u64, limit: Option<u32>) -> (Vec<String>, Vec<u64>, u64) {
        let mut lines: Vec<&LogLine> = self.logs.iter().filter(|l| l.seq >= after).collect();
        if let Some(n) = limit {
            let n = n as usize;
            if lines.len() > n {
                lines = lines.split_off(lines.len() - n);
            }
        }
        let (text, at): (Vec<String>, Vec<u64>) =
            lines.iter().map(|l| (l.line.clone(), l.at_ms)).unzip();
        (text, at, self.next_seq)
    }
}

pub struct PortForwardManager {
    pub forwards: HashMap<String, ManagedPortForward>,
    pub event_tx: mpsc::UnboundedSender<PfEvent>,
}

impl PortForwardManager {
    pub fn new(event_tx: mpsc::UnboundedSender<PfEvent>) -> Self {
        Self {
            forwards: HashMap::new(),
            event_tx,
        }
    }

    pub async fn start_all(&mut self, project_name: &str, configs: &[PortForwardConfig]) {
        self.start(project_name, configs, false);
    }

    /// Start forwards that services depend on. A forward whose local port
    /// already answers is left stopped and reported as served locally.
    pub async fn start_for_dependents(
        &mut self,
        project_name: &str,
        configs: &[PortForwardConfig],
    ) {
        self.start(project_name, configs, true);
    }

    fn start(&mut self, project_name: &str, configs: &[PortForwardConfig], for_dependent: bool) {
        for cfg in configs {
            let Some((label, stop)) = self.insert_starting(project_name, cfg) else {
                continue;
            };
            let watch = watch_portforward(
                project_name.to_string(),
                label.clone(),
                cfg.namespace.clone(),
                cfg.pod.clone(),
                cfg.local_port,
                cfg.remote_port,
                self.event_tx.clone(),
                Arc::clone(&stop),
            );
            // Tests never run kubectl or lsof: their forwards stay Starting.
            if for_dependent {
                tokio::spawn(local::serve_for_dependent(
                    project_name.to_string(),
                    label,
                    cfg.local_port,
                    self.event_tx.clone(),
                    stop,
                    port_answers(cfg.local_port),
                    async move {
                        if !cfg!(test) {
                            watch.await
                        }
                    },
                ));
            } else if !cfg!(test) {
                tokio::spawn(watch);
            }
        }
    }

    /// Record `cfg` as `Starting` unless it is already up or starting.
    fn insert_starting(
        &mut self,
        project_name: &str,
        cfg: &PortForwardConfig,
    ) -> Option<(String, Arc<Notify>)> {
        let label = cfg
            .name
            .clone()
            .unwrap_or_else(|| format!("{}:{}", cfg.namespace, cfg.pod));
        let key = format!("{}/{}", project_name, label);

        if let Some(pf) = self.forwards.get(&key) {
            if matches!(
                pf.status,
                PfStatus::Active | PfStatus::Starting | PfStatus::Restarting
            ) {
                return None;
            }
        }

        let stop = Arc::new(Notify::new());
        self.forwards.insert(
            key,
            ManagedPortForward {
                name: label.clone(),
                namespace: cfg.namespace.clone(),
                pod_prefix: cfg.pod.clone(),
                local_port: cfg.local_port,
                remote_port: cfg.remote_port,
                status: PfStatus::Starting,
                last_event: None,
                served_locally: false,
                failure: None,
                logs: vec![LogLine {
                    seq: 0,
                    at_ms: now_ms(),
                    line: format!(
                        "Starting port-forward {}:{} → {}:{} ...",
                        cfg.namespace, cfg.pod, cfg.local_port, cfg.remote_port
                    ),
                }],
                next_seq: 1,
                stop: Arc::clone(&stop),
            },
        );
        Some((label, stop))
    }

    pub fn apply_event(&mut self, event: PfEvent) {
        let key = format!("{}/{}", event.project(), event.name());
        match &event {
            PfEvent::Log { line, .. } => {
                if let Some(pf) = self.forwards.get_mut(&key) {
                    pf.push_log(line.clone());
                }
            }
            PfEvent::Active { local_port, .. } => {
                if let Some(pf) = self.forwards.get_mut(&key) {
                    pf.status = PfStatus::Active;
                    pf.push_log(format!("✓ Forwarding :{local_port}"));
                }
            }
            PfEvent::Restarted { local_port, .. } => {
                if let Some(pf) = self.forwards.get_mut(&key) {
                    pf.status = PfStatus::Active;
                    pf.last_event = Some(format!("⟳ restarted :{local_port}"));
                    pf.push_log(format!("⟳ Restarted port-forward :{local_port}"));
                }
            }
            PfEvent::Failed {
                local_port, reason, ..
            } => {
                if let Some(pf) = self.forwards.get_mut(&key) {
                    pf.status = PfStatus::Failed;
                    pf.last_event = Some(format!("✗ failed :{local_port}"));
                    pf.failure = Some(reason.clone());
                    pf.push_log(format!(
                        "✗ Port-forward :{local_port} gave up after max retries: {reason}"
                    ));
                }
            }
            PfEvent::ServedLocally { local_port, .. } => {
                if let Some(pf) = self
                    .forwards
                    .get_mut(&key)
                    .filter(|pf| pf.status == PfStatus::Starting)
                {
                    pf.status = PfStatus::Stopped;
                    pf.served_locally = true;
                    pf.push_log(format!(
                        "Port {local_port} is already served locally — using it instead of starting the forward"
                    ));
                }
            }
        }
    }

    /// A window of a port-forward's retained logs (see `service::LogLine` and
    /// `ManagedPortForward::window` for cursor semantics).
    pub fn log_window(
        &self,
        project_name: &str,
        name: &str,
        after: u64,
        limit: Option<u32>,
    ) -> (Vec<String>, Vec<u64>, u64) {
        let key = format!("{project_name}/{name}");
        self.forwards
            .get(&key)
            .map(|pf| pf.window(after, limit))
            .unwrap_or((Vec::new(), Vec::new(), 0))
    }

    /// The sequence number of the newest retained line (0 when none).
    pub fn newest_seq(&self, project_name: &str, name: &str) -> u64 {
        let key = format!("{project_name}/{name}");
        self.forwards
            .get(&key)
            .map(|pf| pf.next_seq.saturating_sub(1))
            .unwrap_or(0)
    }

    /// Stop every forward we started — signals each watcher, which kills its
    /// own kubectl child. Never touches port-forwards started outside warpforge.
    pub async fn stop_all(&mut self) -> anyhow::Result<()> {
        for pf in self.forwards.values_mut() {
            pf.stop.notify_waiters();
            pf.status = PfStatus::Stopped;
        }
        Ok(())
    }

    pub fn stop_project(&mut self, project_name: &str) {
        let prefix = format!("{project_name}/");
        for (key, pf) in self.forwards.iter_mut() {
            if key.starts_with(&prefix) {
                pf.stop.notify_waiters();
                pf.status = PfStatus::Stopped;
            }
        }
    }

    /// Stop a single named forward within a project.
    pub fn stop(&mut self, project_name: &str, name: &str) {
        let key = format!("{project_name}/{name}");
        if let Some(pf) = self.forwards.get_mut(&key) {
            pf.stop.notify_waiters();
            pf.status = PfStatus::Stopped;
        }
    }

    /// Stop and forget a forward removed from (or changed in) project config.
    pub fn remove(&mut self, project_name: &str, name: &str) {
        let key = format!("{project_name}/{name}");
        self.stop(project_name, name);
        self.forwards.remove(&key);
    }

    #[allow(dead_code)] // retained for symmetry with the other managers
    pub fn list_for_project(&self, project_name: &str) -> Vec<&ManagedPortForward> {
        let prefix = format!("{project_name}/");
        let mut list: Vec<&ManagedPortForward> = self
            .forwards
            .iter()
            .filter(|(k, _)| k.starts_with(&prefix))
            .map(|(_, v)| v)
            .collect();
        list.sort_by_key(|pf| pf.local_port);
        list
    }
}
