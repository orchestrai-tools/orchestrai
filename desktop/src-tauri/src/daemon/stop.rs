//! Stopping a daemon: the one this app holds, on quit, and a desktop-owned one
//! found unresponsive at launch.

use std::path::Path;
use std::time::{Duration, Instant};

use warpforge_protocol::DaemonEndpoint;

use super::process::{executable, has_daemon_argument, start_time};
use super::{DaemonProcess, ManagedDaemon};

impl DaemonProcess {
    /// SIGTERM the spawned daemon, wait up to `timeout`, then kill it. The
    /// signal comes first so a forced quit does not orphan its service process
    /// groups. A daemon the app did not spawn is not held here.
    pub(crate) fn terminate(&self, timeout: Duration) {
        let Ok(mut guard) = self.child.lock() else {
            return;
        };
        let Some(child) = guard.take() else {
            return;
        };
        let pid = match &child {
            ManagedDaemon::Development(child) => child.id(),
            ManagedDaemon::Sidecar(child) => child.pid(),
        };
        request_stop(pid);
        let deadline = Instant::now() + timeout;
        match child {
            ManagedDaemon::Development(mut child) => loop {
                match child.try_wait() {
                    Ok(Some(_)) => return,
                    Ok(None) if Instant::now() < deadline => {
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    _ => {
                        let _ = child.kill();
                        let _ = child.wait();
                        return;
                    }
                }
            },
            ManagedDaemon::Sidecar(child) => {
                // No wait primitive on a sidecar child, so poll its pid. The
                // port closes long before the teardown after SIGTERM ends.
                if !await_exit(pid, None, timeout) {
                    let _ = child.kill();
                }
            }
        }
    }
}

/// Ask a spawned daemon to shut down gracefully. Its SIGTERM handler stops
/// services, port-forwards and agents and removes `daemon.json`.
#[cfg(unix)]
fn request_stop(pid: u32) {
    // SAFETY: `kill` is async-signal-safe, and `pid` is a daemon this app
    // spawned or has just confirmed with `is_daemon_process`.
    unsafe {
        libc::kill(pid as libc::pid_t, libc::SIGTERM);
    }
}

#[cfg(not(unix))]
fn request_stop(_pid: u32) {}

/// SIGTERM, a bounded wait, then SIGKILL — each sent only while `found.pid`
/// is still that daemon, so a pid recycled in the meantime is left alone.
#[cfg(unix)]
pub(super) fn stop_unresponsive(found: &DaemonEndpoint, timeout: Duration) {
    if !is_daemon_process(found.pid, Some(found)) {
        return;
    }
    request_stop(found.pid);
    if !await_exit(found.pid, Some(found), timeout) {
        // SAFETY: as in `request_stop`; `await_exit` has just confirmed the pid.
        unsafe {
            libc::kill(found.pid as libc::pid_t, libc::SIGKILL);
        }
    }
}

#[cfg(not(unix))]
pub(super) fn stop_unresponsive(_found: &DaemonEndpoint, _timeout: Duration) {}

/// Wait up to `timeout` for the daemon at `pid` to exit, sending nothing.
/// @param pid the daemon's pid
/// @param found its `daemon.json` entry, when that is where the pid came from
/// @param timeout how long to wait
/// @returns whether it is gone
pub(super) fn await_exit(pid: u32, found: Option<&DaemonEndpoint>, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while is_daemon_process(pid, found) {
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    true
}

/// Whether `pid` is a live daemon: run with a `daemon` argument, and the
/// process `found` recorded, or when it recorded nothing, a binary named like
/// the daemon. `daemon.json` outlives a crashed daemon; its pid may be reused.
/// @param pid the process to check
/// @param found the `daemon.json` entry `pid` came from, if any
/// @returns true when signalling `pid` reaches that daemon
pub(super) fn is_daemon_process(pid: u32, found: Option<&DaemonEndpoint>) -> bool {
    // `kill` reads 0 and negative pids as whole process groups.
    if pid <= 1 || pid > i32::MAX as u32 {
        return false;
    }
    executable(pid).is_some_and(|exe| {
        has_daemon_argument(pid) && is_recorded_daemon(&exe, start_time(pid), found)
    })
}

/// `wf` is the name `install.sh` gives the CLI.
fn is_recorded_daemon(exe: &Path, started_at: Option<u64>, found: Option<&DaemonEndpoint>) -> bool {
    let recorded = found.and_then(|found| Some((found.exe.as_deref()?, found.started_at?)));
    match recorded {
        Some((recorded_exe, recorded_start)) => {
            started_at == Some(recorded_start) && same_file(exe, Path::new(recorded_exe))
        }
        None => {
            let daemon = super::spawn::find_daemon_bin();
            exe.file_name() == daemon.file_name() || exe.file_name() == Some("wf".as_ref())
        }
    }
}

fn same_file(a: &Path, b: &Path) -> bool {
    let canonical = |path: &Path| std::fs::canonicalize(path).unwrap_or_else(|_| path.into());
    canonical(a) == canonical(b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    #[cfg(unix)]
    fn spawned(script: &str) -> DaemonProcess {
        let child = Command::new("sh").args(["-c", script]).spawn().unwrap();
        // Let the shell install its trap before a signal can arrive.
        std::thread::sleep(Duration::from_millis(100));
        DaemonProcess::new(Some(ManagedDaemon::Development(child)))
    }

    #[cfg(unix)]
    #[test]
    fn terminate_asks_the_child_to_stop_before_killing_it() {
        // `sh` exits at once on SIGTERM; only the signal makes this fast, so a
        // long wait would mean the stop request never went out.
        let process = spawned("trap 'exit 0' TERM; while true; do sleep 0.2; done");
        let start = Instant::now();
        process.terminate(Duration::from_secs(10));
        assert!(
            start.elapsed() < Duration::from_secs(2),
            "the child should exit on SIGTERM, not wait out the timeout"
        );
    }

    #[cfg(unix)]
    #[test]
    fn terminate_kills_a_child_that_ignores_the_stop_request() {
        let process = spawned("trap '' TERM; while true; do sleep 0.2; done");
        let start = Instant::now();
        process.terminate(Duration::from_millis(500));
        assert!(
            start.elapsed() >= Duration::from_millis(400),
            "a child ignoring SIGTERM must be killed after the bounded wait"
        );
    }

    #[test]
    fn only_a_process_running_the_daemon_binary_counts() {
        for pid in [std::process::id(), 0, 1, u32::MAX] {
            assert!(!is_daemon_process(pid, None), "{pid}");
        }
    }

    fn recorded(exe: &str, started_at: u64) -> DaemonEndpoint {
        DaemonEndpoint {
            pid: 42,
            url: "ws://127.0.0.1:1".into(),
            token: String::new(),
            version: String::new(),
            protocol_version: 0,
            owner: warpforge_protocol::DaemonOwner::Desktop,
            exe: Some(exe.into()),
            started_at: Some(started_at),
        }
    }

    #[test]
    fn a_recorded_daemon_must_match_both_its_executable_and_its_start_time() {
        let found = recorded("/opt/bin/wf-daemon", 7);
        let exe = Path::new("/opt/bin/wf-daemon");
        assert!(is_recorded_daemon(exe, Some(7), Some(&found)));
        assert!(!is_recorded_daemon(exe, Some(8), Some(&found)));
        assert!(!is_recorded_daemon(exe, None, Some(&found)));
        let other = Path::new("/opt/bin/warpforge");
        assert!(!is_recorded_daemon(other, Some(7), Some(&found)));
    }

    #[test]
    fn without_a_record_the_binary_name_decides() {
        assert!(is_recorded_daemon(
            Path::new("/usr/local/bin/wf"),
            None,
            None
        ));
        let daemon = super::super::spawn::find_daemon_bin();
        let name = daemon.file_name().unwrap();
        assert!(is_recorded_daemon(
            &Path::new("/elsewhere").join(name),
            None,
            None
        ));
        assert!(!is_recorded_daemon(Path::new("/bin/sh"), Some(1), None));
    }
}
