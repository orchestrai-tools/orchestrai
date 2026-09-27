//! What the app does at launch with the daemon `daemon.json` records.

use std::time::Duration;

use tauri::AppHandle;
use warpforge_protocol::DaemonOwner;

use super::{endpoint, probe, spawn, stop, DaemonProcess};
use crate::sidecar_log::SidecarLog;

/// Generous on purpose: a busy but healthy desktop daemon that misses it is
/// killed along with its agents and services, without the quit dialog.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);
const UNRESPONSIVE_EXIT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, PartialEq, Eq)]
enum FoundDaemon {
    Reuse,
    /// Its process is gone, so nothing is in the way of a new daemon.
    Spawn,
    Replace,
    /// Started outside the app: leave it running and tell the user.
    Report,
}

fn found_daemon_action(responded: bool, owner: DaemonOwner, pid_alive: bool) -> FoundDaemon {
    match (responded, pid_alive, owner) {
        (true, _, _) => FoundDaemon::Reuse,
        (false, false, _) => FoundDaemon::Spawn,
        (false, true, DaemonOwner::Desktop) => FoundDaemon::Replace,
        (false, true, DaemonOwner::External) => FoundDaemon::Report,
    }
}

/// Reuse the recorded daemon only if it answers the handshake; a TCP connect
/// alone also succeeds against a daemon whose actor has died.
pub(crate) fn start(app: &AppHandle, sidecar_log: &SidecarLog) -> DaemonProcess {
    let Some(found) = endpoint::read_endpoint() else {
        return spawn::spawn(app, sidecar_log);
    };
    let responded = probe::answers_handshake(&found, HANDSHAKE_TIMEOUT);
    let pid_alive = stop::is_daemon_process(found.pid);
    match found_daemon_action(responded, found.owner, pid_alive) {
        FoundDaemon::Reuse => {
            eprintln!("warpforge: daemon already running — reusing");
            sidecar_log.lifecycle("reusing an already-running daemon");
            DaemonProcess::new(None)
        }
        FoundDaemon::Spawn => spawn::spawn(app, sidecar_log),
        FoundDaemon::Replace => {
            let note = format!(
                "daemon pid {} is not responding; stopping it and starting a new one",
                found.pid
            );
            eprintln!("warpforge: {note}");
            sidecar_log.error(&note);
            stop::stop_unresponsive(found.pid, UNRESPONSIVE_EXIT_TIMEOUT);
            spawn::spawn(app, sidecar_log)
        }
        FoundDaemon::Report => {
            let reason = format!(
                "The running daemon (pid {}) is not responding. It was started outside Warpforge, so it was left running: stop it, then relaunch Warpforge.",
                found.pid
            );
            eprintln!("warpforge: {reason}");
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

    #[test]
    fn a_daemon_that_answers_is_reused_whoever_owns_it() {
        for owner in [DaemonOwner::Desktop, DaemonOwner::External] {
            assert_eq!(found_daemon_action(true, owner, true), FoundDaemon::Reuse);
        }
    }

    #[test]
    fn a_silent_daemon_whose_process_is_gone_just_gets_a_new_one() {
        for owner in [DaemonOwner::Desktop, DaemonOwner::External] {
            assert_eq!(found_daemon_action(false, owner, false), FoundDaemon::Spawn);
        }
    }

    #[test]
    fn a_silent_desktop_daemon_is_stopped_and_replaced() {
        assert_eq!(
            found_daemon_action(false, DaemonOwner::Desktop, true),
            FoundDaemon::Replace
        );
    }

    #[test]
    fn a_silent_external_daemon_is_left_running_and_reported() {
        assert_eq!(
            found_daemon_action(false, DaemonOwner::External, true),
            FoundDaemon::Report
        );
    }
}
