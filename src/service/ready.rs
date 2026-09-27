//! Readiness: how a started service proves it is up, and the deadline after
//! which it is marked failed instead of sitting in Starting forever.

use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tokio::time::{sleep, timeout, Instant};

use super::{ServiceEvent, ServiceStatus};
use crate::config::{parse_duration, ServiceConfig};

pub(super) const DEFAULT_PROBE_INTERVAL: Duration = Duration::from_secs(1);
pub(super) const DEFAULT_READY_TIMEOUT: Duration = Duration::from_secs(300);
const RECOVERY_INTERVAL: Duration = Duration::from_secs(5);
const PROBE_TIMEOUT: Duration = Duration::from_secs(2);

/// How a service's readiness is decided, resolved from its config.
#[derive(Debug, Clone, PartialEq)]
pub struct Readiness {
    pub pattern: Option<String>,
    /// Raw `healthcheck.url`; `${svc.port}` is interpolated at spawn.
    pub healthcheck_url: Option<String>,
    pub interval: Duration,
    pub timeout: Duration,
}

impl Default for Readiness {
    fn default() -> Self {
        Self {
            pattern: None,
            healthcheck_url: None,
            interval: DEFAULT_PROBE_INTERVAL,
            timeout: DEFAULT_READY_TIMEOUT,
        }
    }
}

impl Readiness {
    /// Missing or unparseable durations fall back to the defaults.
    pub fn from_config(svc: &ServiceConfig) -> Self {
        let healthcheck = svc.healthcheck.as_ref();
        Self {
            pattern: svc.ready_pattern.clone(),
            healthcheck_url: healthcheck.map(|h| h.url.clone()),
            interval: healthcheck
                .and_then(|h| h.interval.as_deref())
                .and_then(parse_duration)
                .unwrap_or(DEFAULT_PROBE_INTERVAL),
            timeout: svc
                .ready_timeout
                .as_deref()
                .and_then(parse_duration)
                .unwrap_or(DEFAULT_READY_TIMEOUT),
        }
    }
}

/// The active check polled until a service is ready.
#[derive(Debug, Clone)]
pub(super) enum Probe {
    Http {
        url: String,
        client: reqwest::Client,
    },
    Tcp(u16),
    /// Nothing to poll: only a matching log line makes the service ready.
    LogLine(String),
}

impl Probe {
    /// A healthcheck wins over the port, the port over a bare `readyPattern`.
    /// `None` means there is no readiness signal at all.
    pub(super) fn select(url: Option<String>, port: u16, pattern: Option<&str>) -> Option<Self> {
        match (url, port, pattern) {
            (Some(url), _, _) => Some(Probe::Http {
                client: health_client(&url),
                url,
            }),
            (None, port, _) if port > 0 => Some(Probe::Tcp(port)),
            (None, _, Some(pattern)) => Some(Probe::LogLine(pattern.to_string())),
            _ => None,
        }
    }

    async fn check(&self) -> Result<(), String> {
        match self {
            Probe::Http { url, client } => match client.get(url).send().await {
                Ok(r) if r.status().is_success() || r.status().is_redirection() => Ok(()),
                Ok(r) => Err(format!("{url} returned {}", r.status())),
                Err(e) => Err(format!("{url}: {}", root_cause(&e))),
            },
            Probe::Tcp(port) => {
                match timeout(PROBE_TIMEOUT, TcpStream::connect(("127.0.0.1", *port))).await {
                    Ok(Ok(_)) => Ok(()),
                    Ok(Err(e)) => Err(format!("nothing accepted connections on port {port} ({e})")),
                    Err(_) => Err(format!("connecting to port {port} timed out")),
                }
            }
            Probe::LogLine(pattern) => Err(format!("no log line matched \"{pattern}\"")),
        }
    }
}

/// A healthcheck never goes through a proxy. A self-signed certificate is
/// trusted only on a loopback host, where a dev server usually has one.
fn health_client(url: &str) -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(PROBE_TIMEOUT)
        .danger_accept_invalid_certs(is_loopback(url))
        .build()
        .unwrap_or_default()
}

/// Whether `url` points at localhost, 127.0.0.0/8 or `::1`.
pub(super) fn is_loopback(url: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(url) else {
        return false;
    };
    let host = url.host_str().unwrap_or_default();
    let host = host.trim_start_matches('[').trim_end_matches(']');
    host.eq_ignore_ascii_case("localhost")
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback())
}

fn root_cause(error: &dyn std::error::Error) -> String {
    let mut cause = error;
    while let Some(next) = cause.source() {
        cause = next;
    }
    cause.to_string()
}

/// One run of one service, shared by every task that reports on it. Ready and
/// exited are final verdicts: the first settles the run and later ones are
/// dropped. A timeout is not final, so a late ready still wins while the run lives.
#[derive(Clone)]
pub(super) struct RunHandle {
    pub tx: mpsc::UnboundedSender<ServiceEvent>,
    pub key: String,
    pub run_id: u64,
    pub stopping: Arc<AtomicBool>,
    pub settled: Arc<AtomicBool>,
    timed_out: Arc<AtomicBool>,
    started: std::time::Instant,
}

impl RunHandle {
    pub(super) fn new(
        tx: mpsc::UnboundedSender<ServiceEvent>,
        key: String,
        run_id: u64,
        stopping: Arc<AtomicBool>,
    ) -> Self {
        Self {
            tx,
            key,
            run_id,
            stopping,
            settled: Arc::new(AtomicBool::new(false)),
            timed_out: Arc::new(AtomicBool::new(false)),
            started: std::time::Instant::now(),
        }
    }

    fn abandoned(&self) -> bool {
        self.stopping.load(Ordering::SeqCst) || self.settled.load(Ordering::SeqCst)
    }

    pub(super) fn settle(&self) -> bool {
        !self.settled.swap(true, Ordering::SeqCst)
    }

    pub(super) fn report_running(&self) {
        if !self.settle() {
            return;
        }
        let event = if self.timed_out.load(Ordering::SeqCst) {
            ServiceEvent::LateReady {
                key: self.key.clone(),
                run_id: self.run_id,
                after: Duration::from_secs(self.started.elapsed().as_secs()),
            }
        } else {
            ServiceEvent::StatusChange {
                key: self.key.clone(),
                run_id: self.run_id,
                status: ServiceStatus::Running,
                exit_code: None,
            }
        };
        let _ = self.tx.send(event);
    }

    fn report_not_ready(&self, reason: String) {
        if self.settled.load(Ordering::SeqCst) || self.timed_out.swap(true, Ordering::SeqCst) {
            return;
        }
        let _ = self.tx.send(ServiceEvent::NotReady {
            key: self.key.clone(),
            run_id: self.run_id,
            reason,
        });
    }
}

#[derive(Debug, PartialEq)]
pub(super) enum Outcome {
    Ready,
    TimedOut(String),
    Abandoned,
}

/// How often to probe, how long to wait before failing, and how often to keep
/// probing a timed-out run that is still alive.
#[derive(Debug, Clone, Copy)]
pub(super) struct Timing {
    pub interval: Duration,
    pub timeout: Duration,
    pub recovery_interval: Duration,
}

impl Timing {
    fn for_readiness(readiness: &Readiness) -> Self {
        Self {
            interval: readiness.interval,
            timeout: readiness.timeout,
            recovery_interval: readiness.interval.max(RECOVERY_INTERVAL),
        }
    }
}

/// Poll `probe` every `interval` until it succeeds, `abandoned` turns true, or
/// `ready_timeout` elapses. A timeout carries the last probe error.
pub(super) async fn await_ready<P, F>(
    probe: &mut P,
    interval: Duration,
    ready_timeout: Duration,
    abandoned: impl Fn() -> bool,
) -> Outcome
where
    P: FnMut() -> F,
    F: Future<Output = Result<(), String>>,
{
    let deadline = Instant::now() + ready_timeout;
    let mut last_error = "no probe completed".to_string();
    loop {
        if abandoned() {
            return Outcome::Abandoned;
        }
        match tokio::time::timeout_at(deadline, probe()).await {
            Ok(Ok(())) => return Outcome::Ready,
            Ok(Err(error)) => last_error = error,
            Err(_) => return Outcome::TimedOut(last_error),
        }
        let now = Instant::now();
        if now >= deadline {
            return Outcome::TimedOut(last_error);
        }
        sleep(interval.min(deadline - now)).await;
    }
}

/// Spawn the task that decides a run's readiness with `probe`. After a timeout
/// it keeps probing at `recovery_interval` until the run is ready, exits, or stops.
pub(super) fn spawn_monitor<P, F>(run: RunHandle, timing: Timing, mut probe: P)
where
    P: FnMut() -> F + Send + 'static,
    F: Future<Output = Result<(), String>> + Send + 'static,
{
    tokio::spawn(async move {
        let abandoned = || run.abandoned();
        match await_ready(&mut probe, timing.interval, timing.timeout, abandoned).await {
            Outcome::Ready => return run.report_running(),
            Outcome::Abandoned => return,
            Outcome::TimedOut(error) => run.report_not_ready(format!(
                "did not become ready within {}: {error}",
                format_duration(timing.timeout)
            )),
        }
        loop {
            sleep(timing.recovery_interval).await;
            if run.abandoned() {
                return;
            }
            let attempt = timeout(timing.recovery_interval.max(PROBE_TIMEOUT), probe()).await;
            if matches!(attempt, Ok(Ok(()))) {
                return run.report_running();
            }
        }
    });
}

/// Start deciding readiness for a freshly spawned run. With no probe there is
/// no signal to wait for, so the run is ready as soon as it exists.
pub(super) fn spawn_readiness(run: RunHandle, readiness: &Readiness, probe: Option<Probe>) {
    let Some(probe) = probe else {
        run.report_running();
        return;
    };
    spawn_monitor(run, Timing::for_readiness(readiness), move || {
        let probe = probe.clone();
        async move { probe.check().await }
    });
}

/// Render a duration the way config spells it: "5m", "90s", "500ms".
pub(super) fn format_duration(duration: Duration) -> String {
    let ms = duration.as_millis();
    if ms > 0 && ms.is_multiple_of(60_000) {
        format!("{}m", ms / 60_000)
    } else if ms > 0 && ms.is_multiple_of(1000) {
        format!("{}s", ms / 1000)
    } else {
        format!("{ms}ms")
    }
}
