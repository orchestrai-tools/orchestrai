//! What the app does at launch with the daemon `daemon.json` records.

use std::time::Duration;

use tauri::AppHandle;
use warpforge_protocol::DaemonOwner;

use super::probe::Probe;
use super::{endpoint, probe, spawn, stop, DaemonProcess};
use crate::sidecar_log::SidecarLog;

/// Generous on purpose: a busy but healthy desktop daemon that misses it is
/// killed along with its agents and services, without the quit dialog.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);
const UNRESPONSIVE_EXIT_TIMEOUT: Duration = Duration::from_secs(5);
/// A daemon's SIGTERM teardown stops whole service trees, as a quit does.
const SHUTDOWN_EXIT_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, PartialEq, Eq)]
enum FoundDaemon {
    Reuse,
    /// Its process is gone, so nothing is in the way of a new daemon.
    Spawn,
    /// Its listener is closed but its process runs: it is shutting down.
    /// Wait for it without a signal, then start a new one.
    AwaitExit,
    Replace,
    /// Started outside the app: leave it running and tell the user.
    Report,
}

fn found_daemon_action(probe: Probe, owner: DaemonOwner, pid_alive: bool) -> FoundDaemon {
    match (probe, pid_alive, owner) {
        (Probe::Answered, _, _) => FoundDaemon::Reuse,
        (_, false, _) => FoundDaemon::Spawn,
        (Probe::NotListening, true, _) => FoundDaemon::AwaitExit,
        (Probe::Silent, true, DaemonOwner::Desktop) => FoundDaemon::Replace,
        (Probe::Silent, true, DaemonOwner::External) => FoundDaemon::Report,
    }
}

/// Reuse the recorded daemon only if it answers the handshake; a TCP connect
/// alone also succeeds against a daemon whose actor has died.
pub(crate) fn start(app: &AppHandle, sidecar_log: &SidecarLog) -> DaemonProcess {
    let Some(found) = endpoint::read_endpoint() else {
        return spawn::spawn(app, sidecar_log);
    };
    let probed = probe::probe(&found, HANDSHAKE_TIMEOUT);
    let pid_alive = stop::is_daemon_process(found.pid, Some(&found));
    match found_daemon_action(probed, found.owner, pid_alive) {
        FoundDaemon::Reuse => {
            eprintln!("orchestrai: daemon already running — reusing");
            sidecar_log.lifecycle("reusing an already-running daemon");
            DaemonProcess::new(None)
        }
        FoundDaemon::Spawn => spawn::spawn(app, sidecar_log),
        FoundDaemon::AwaitExit => {
            let note = format!("daemon pid {} is shutting down; waiting for it", found.pid);
            eprintln!("orchestrai: {note}");
            sidecar_log.lifecycle(&note);
            if !stop::await_exit(found.pid, Some(&found), SHUTDOWN_EXIT_TIMEOUT) {
                sidecar_log.error(&format!(
                    "daemon pid {} is still shutting down; starting a new one anyway",
                    found.pid
                ));
            }
            spawn::spawn(app, sidecar_log)
        }
        FoundDaemon::Replace => {
            let note = format!(
                "daemon pid {} is not responding; stopping it and starting a new one",
                found.pid
            );
            eprintln!("orchestrai: {note}");
            sidecar_log.error(&note);
            stop::stop_unresponsive(&found, UNRESPONSIVE_EXIT_TIMEOUT);
            spawn::spawn(app, sidecar_log)
        }
        FoundDaemon::Report => {
            let reason = format!(
                "The running daemon (pid {}) is not responding. It was started outside OrchestrAI, so it was left running: stop it, then relaunch OrchestrAI.",
                found.pid
            );
            eprintln!("orchestrai: {reason}");
            sidecar_log.error(&reason);
            DaemonProcess {
                unusable: Some(reason),
                ..DaemonProcess::new(None)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const OWNERS: [DaemonOwner; 2] = [DaemonOwner::Desktop, DaemonOwner::External];

    #[test]
    fn a_daemon_that_answers_is_reused_whoever_owns_it() {
        for owner in OWNERS {
            assert_eq!(
                found_daemon_action(Probe::Answered, owner, true),
                FoundDaemon::Reuse
            );
        }
    }

    #[test]
    fn a_daemon_whose_process_is_gone_just_gets_a_new_one() {
        for owner in OWNERS {
            for probe in [Probe::NotListening, Probe::Silent] {
                assert_eq!(found_daemon_action(probe, owner, false), FoundDaemon::Spawn);
            }
        }
    }

    #[test]
    fn a_live_daemon_that_refuses_the_connection_is_shutting_down_and_never_killed() {
        for owner in OWNERS {
            assert_eq!(
                found_daemon_action(Probe::NotListening, owner, true),
                FoundDaemon::AwaitExit
            );
        }
    }

    #[test]
    fn a_silent_desktop_daemon_is_stopped_and_replaced() {
        assert_eq!(
            found_daemon_action(Probe::Silent, DaemonOwner::Desktop, true),
            FoundDaemon::Replace
        );
    }

    #[test]
    fn a_silent_external_daemon_is_left_running_and_reported() {
        assert_eq!(
            found_daemon_action(Probe::Silent, DaemonOwner::External, true),
            FoundDaemon::Report
        );
    }
}
