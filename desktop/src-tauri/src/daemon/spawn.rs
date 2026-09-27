//! Starting a daemon the app then holds: the development binary in debug builds
//! or with `WARPFORGE_DAEMON_BIN`, the bundled sidecar otherwise.

use std::process::Command;

use tauri::AppHandle;
use tauri_plugin_shell::{process::Command as ShellCommand, process::CommandEvent, ShellExt};

use super::{DaemonProcess, ManagedDaemon};
use crate::sidecar_log::SidecarLog;

#[cfg(all(unix, not(debug_assertions)))]
fn configure_sidecar_path(command: ShellCommand, log: &SidecarLog) -> ShellCommand {
    match crate::desktop_env::sidecar_path() {
        Ok(path) => {
            log.lifecycle("resolved and merged the login-shell PATH");
            command.env("PATH", path)
        }
        Err(error) => {
            log.error(&format!(
                "could not resolve login-shell PATH; using inherited PATH: {error}"
            ));
            command
        }
    }
}

#[cfg(not(all(unix, not(debug_assertions))))]
fn configure_sidecar_path(command: ShellCommand, _log: &SidecarLog) -> ShellCommand {
    command
}

/// The daemon binary: `WARPFORGE_DAEMON_BIN`, else a `warpforge` next to this
/// exe (the app bundle), else the workspace's `target/debug/warpforge`
/// (`tauri dev`), else `warpforge` on `PATH`.
pub(super) fn find_daemon_bin() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("WARPFORGE_DAEMON_BIN") {
        return p.into();
    }
    if let Ok(exe) = std::env::current_exe() {
        let dir = exe.parent().expect("exe has no parent dir");
        // Prod: warpforge binary bundled next to warpforge-desktop.
        let sibling = dir.join("warpforge");
        if sibling.exists() {
            return sibling;
        }
        // Dev layout: desktop/src-tauri/target/debug/warpforge-desktop
        //   dir = debug/  →  target/  →  src-tauri/  →  desktop/  →  workspace root
        let workspace = dir
            .parent() // target/
            .and_then(|p| p.parent()) // src-tauri/
            .and_then(|p| p.parent()) // desktop/
            .and_then(|p| p.parent()); // workspace root
        if let Some(root) = workspace {
            let dev_bin = root.join("target").join("debug").join("warpforge");
            if dev_bin.exists() {
                return dev_bin;
            }
        }
    }
    "warpforge".into()
}

pub(super) fn spawn(app: &AppHandle, sidecar_log: &SidecarLog) -> DaemonProcess {
    let explicit_bin = std::env::var_os("WARPFORGE_DAEMON_BIN");
    let spawned = if explicit_bin.is_some() || cfg!(debug_assertions) {
        let bin = find_daemon_bin();
        // This daemon inherits the app's own stdio, not a pipe the app reads,
        // so it can keep printing to the dev terminal (`daemon::server::stdio`).
        Command::new(&bin)
            .args(["daemon", "--owner", "desktop"])
            .env("WARPFORGE_DAEMON_STDIO", "inherit")
            .spawn()
            .map(ManagedDaemon::Development)
            .map_err(|error| format!("could not spawn daemon ({bin:?}): {error}"))
    } else {
        app.shell()
            .sidecar("warpforge")
            .map(|command| configure_sidecar_path(command, sidecar_log))
            .map_err(|error| error.to_string())
            .and_then(|command| {
                command
                    .args(["daemon", "--owner", "desktop"])
                    .spawn()
                    .map_err(|error| error.to_string())
            })
            .map(|(mut events, child)| {
                let event_log = sidecar_log.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(event) = events.recv().await {
                        match event {
                            // Stdout can contain protocol/prompt content and is
                            // intentionally drained without persistence.
                            CommandEvent::Stdout(_) => {}
                            CommandEvent::Stderr(bytes) => event_log.stderr(&bytes),
                            CommandEvent::Error(error) => event_log.error(&error),
                            CommandEvent::Terminated(payload) => event_log.lifecycle(&format!(
                                "daemon terminated (code={:?}, signal={:?})",
                                payload.code, payload.signal
                            )),
                            _ => event_log.error("received an unknown sidecar event"),
                        }
                    }
                    event_log.lifecycle("sidecar event stream closed");
                });
                ManagedDaemon::Sidecar(child)
            })
            .map_err(|error| format!("could not spawn bundled daemon: {error}"))
    };

    match spawned {
        Ok(child) => {
            let daemon = DaemonProcess::new(Some(child));
            if let Some(pid) = daemon.pid() {
                eprintln!("warpforge: spawned daemon pid {pid}");
                sidecar_log.lifecycle(&format!("spawned daemon pid {pid}"));
            }
            daemon
        }
        Err(error) => {
            eprintln!("warning: {error}");
            sidecar_log.error(&error);
            DaemonProcess::new(None)
        }
    }
}
