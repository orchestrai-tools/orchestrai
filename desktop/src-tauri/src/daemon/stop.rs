//! Stopping a daemon: the one this app holds, on quit, and a desktop-owned one
//! found unresponsive at launch.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use super::endpoint::is_daemon_running;
use super::{DaemonProcess, ManagedDaemon};

impl DaemonProcess {
    /// Ask the spawned daemon to stop (SIGTERM), wait up to `timeout` for it to
    /// exit, then kill it. The forced path and a timed-out `app.quit` never sent
    /// the stop request, so without the signal the daemon dies by SIGKILL and
    /// its service process groups and port-forwards are orphaned. A daemon the
    /// app did not spawn is not held here and is left running.
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
                // No wait primitive on a sidecar child; poll discovery until the
                // daemon is gone (it removes `daemon.json` and closes the port).
                while is_daemon_running() && Instant::now() < deadline {
                    std::thread::sleep(Duration::from_millis(50));
                }
                if is_daemon_running() {
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

/// SIGTERM, a bounded wait, then SIGKILL — each sent only while `pid` still
/// runs the daemon binary, so a pid recycled in the meantime is left alone.
#[cfg(unix)]
pub(super) fn stop_unresponsive(pid: u32, timeout: Duration) {
    if !is_daemon_process(pid) {
        return;
    }
    request_stop(pid);
    let deadline = Instant::now() + timeout;
    while is_daemon_process(pid) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    if is_daemon_process(pid) {
        // SAFETY: as in `request_stop`.
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGKILL);
        }
    }
}

#[cfg(not(unix))]
pub(super) fn stop_unresponsive(_pid: u32, _timeout: Duration) {}

/// Whether `pid` is a live process running the daemon binary. `daemon.json`
/// outlives a crashed daemon, and its pid may since belong to anything.
pub(super) fn is_daemon_process(pid: u32) -> bool {
    // `kill` reads 0 and negative pids as whole process groups.
    if pid <= 1 || pid > i32::MAX as u32 {
        return false;
    }
    let daemon = super::spawn::find_daemon_bin();
    executable(pid).is_some_and(|path| path.file_name() == daemon.file_name())
}

#[cfg(target_os = "macos")]
fn executable(pid: u32) -> Option<PathBuf> {
    use std::os::unix::ffi::OsStrExt;
    let mut path = vec![0u8; libc::PROC_PIDPATHINFO_MAXSIZE as usize];
    // SAFETY: `path` is writable for the length passed.
    let len = unsafe {
        libc::proc_pidpath(
            pid as libc::c_int,
            path.as_mut_ptr().cast(),
            path.len() as u32,
        )
    };
    let len = usize::try_from(len).ok().filter(|&len| len > 0)?;
    Some(PathBuf::from(std::ffi::OsStr::from_bytes(&path[..len])))
}

#[cfg(target_os = "linux")]
fn executable(pid: u32) -> Option<PathBuf> {
    std::fs::read_link(format!("/proc/{pid}/exe")).ok()
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn executable(_pid: u32) -> Option<PathBuf> {
    None
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

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    #[test]
    fn executable_names_a_live_process_and_nothing_once_it_is_reaped() {
        let own = executable(std::process::id()).unwrap();
        assert_eq!(
            own.file_name(),
            std::env::current_exe().unwrap().file_name()
        );
        let mut child = Command::new("true").spawn().unwrap();
        let pid = child.id();
        child.wait().unwrap();
        assert_eq!(executable(pid), None);
    }

    #[test]
    fn only_a_process_running_the_daemon_binary_counts() {
        assert!(!is_daemon_process(std::process::id()));
        assert!(!is_daemon_process(0));
        assert!(!is_daemon_process(1));
        assert!(!is_daemon_process(u32::MAX));
    }
}
