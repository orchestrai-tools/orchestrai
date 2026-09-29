//! Detects a service that ignores its allocated port: the process is up but
//! nothing answers on `$PORT`, usually because the tool picked its own port.

use std::future::Future;
use std::sync::atomic::Ordering;
use std::time::Duration;

use tokio::net::TcpStream;
use tokio::task::AbortHandle;
use tokio::time::{sleep, timeout};

use super::ready::RunHandle;
use super::ServiceEvent;

const GRACE: Duration = Duration::from_secs(10);
const INTERVAL: Duration = Duration::from_secs(3);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(1);

/// A service that is up while its allocated port stays silent.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PortWarning {
    pub expected: u16,
    /// A different local port the service printed in its logs.
    pub announced: Option<u16>,
}

fn strip_ansi(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
            continue;
        }
        if chars.next_if_eq(&'[').is_some() {
            for c in chars.by_ref() {
                if ('@'..='~').contains(&c) {
                    break;
                }
            }
        }
    }
    out
}

/// The port of the first `localhost:`, `127.0.0.1:`, `0.0.0.0:` or `[::1]:`
/// URL in `line`, ANSI codes ignored.
pub(super) fn announced_port(line: &str) -> Option<u16> {
    let line = strip_ansi(line);
    ["localhost:", "127.0.0.1:", "0.0.0.0:", "[::1]:"]
        .iter()
        .filter_map(|host| {
            let at = line.find(host)? + host.len();
            let digits: String = line[at..]
                .chars()
                .take_while(char::is_ascii_digit)
                .collect();
            digits
                .parse::<u16>()
                .ok()
                .filter(|p| *p > 0)
                .map(|p| (at, p))
        })
        .min_by_key(|(at, _)| *at)
        .map(|(_, port)| port)
}

/// Decide the warning for one probe result. `lines` are this run's log lines,
/// oldest first. A silent port only warns once the service is running or has
/// announced another port, so a slow first build stays quiet.
pub(super) fn assess<'a>(
    expected: u16,
    answered: bool,
    running: bool,
    previous: Option<&PortWarning>,
    lines: impl DoubleEndedIterator<Item = &'a str>,
) -> Option<PortWarning> {
    if answered {
        return None;
    }
    let announced = lines
        .rev()
        .filter_map(announced_port)
        .find(|port| *port != expected)
        .or(previous.and_then(|w| w.announced));
    (running || announced.is_some()).then_some(PortWarning {
        expected,
        announced,
    })
}

pub(crate) async fn port_answers(port: u16) -> bool {
    for host in ["127.0.0.1", "::1"] {
        if matches!(
            timeout(CONNECT_TIMEOUT, TcpStream::connect((host, port))).await,
            Ok(Ok(_))
        ) {
            return true;
        }
    }
    false
}

/// When the first probe runs and how long to wait between later ones.
#[derive(Debug, Clone, Copy)]
pub(super) struct WatchTiming {
    pub grace: Duration,
    pub interval: Duration,
}

impl WatchTiming {
    pub(super) const DEFAULT: Self = Self {
        grace: GRACE,
        interval: INTERVAL,
    };
}

/// Owns a running watcher and aborts it when dropped, so stopping, replacing
/// or dropping the service entry ends the watcher, grace period included.
pub(super) struct WatchGuard(AbortHandle);

impl Drop for WatchGuard {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// Probe `port` after a grace period and then every `timing.interval`,
/// reporting each result until the port answers, the run ends, or the
/// returned guard is dropped.
///
/// @param run the run being watched; its flags end the loop
/// @param port the allocated port to probe
/// @param from_seq the first log line of this run
/// @param timing grace period and probe interval
/// @param probe whether `port` accepts a connection
/// @returns the guard that owns the watcher task
pub(super) fn spawn_port_watch<P, F>(
    run: RunHandle,
    port: u16,
    from_seq: u64,
    timing: WatchTiming,
    mut probe: P,
) -> WatchGuard
where
    P: FnMut(u16) -> F + Send + 'static,
    F: Future<Output = bool> + Send,
{
    let task = tokio::spawn(async move {
        sleep(timing.grace).await;
        while !run.stopping.load(Ordering::SeqCst) && !run.exited.load(Ordering::SeqCst) {
            let answered = probe(port).await;
            let _ = run.tx.send(ServiceEvent::PortProbe {
                key: run.key.clone(),
                run_id: run.run_id,
                answered,
                from_seq,
            });
            if answered {
                return;
            }
            sleep(timing.interval).await;
        }
    });
    WatchGuard(task.abort_handle())
}
