#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::{
    process::Command as ShellCommand, process::CommandChild, process::CommandEvent, ShellExt,
};
use warpforge_protocol::DaemonEndpoint;

mod browser;
mod browser_capture;
mod context_menu;
mod desktop_env;
#[cfg(target_os = "macos")]
mod macos;
mod notifications;
mod sidecar_log;
mod window;

use sidecar_log::SidecarLog;

#[cfg(all(unix, not(debug_assertions)))]
fn configure_sidecar_path(command: ShellCommand, log: &SidecarLog) -> ShellCommand {
    match desktop_env::sidecar_path() {
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

enum ManagedDaemon {
    Development(Child),
    Sidecar(CommandChild),
}

/// How long the confirmed quit waits for the daemon to finish tearing down
/// (whole service process trees) before killing it.
const DAEMON_EXIT_TIMEOUT: Duration = Duration::from_secs(15);
/// A repeated exit request this soon after the first means the webview is not
/// answering, so take the forced path instead of refusing forever.
const FORCE_EXIT_WINDOW: Duration = Duration::from_secs(5);
/// How long to wait for the webview to acknowledge a quit request before
/// forcing the exit. The UI answers at once when it has the request.
const QUIT_FALLBACK: Duration = Duration::from_secs(10);

/// Set by [`force_exit`] so the exit it asks for is not refused again.
static ALLOW_EXIT: AtomicBool = AtomicBool::new(false);
/// Set by the `quit_ui_ready` command: the webview has the quit and is asking
/// the user, so the no-answer fallback stands down.
static UI_ACK: AtomicBool = AtomicBool::new(false);
/// When the last quit was handed to the webview.
static LAST_ASK: Mutex<Option<Instant>> = Mutex::new(None);

#[derive(Debug, PartialEq, Eq)]
enum ExitAction {
    /// Leave the event loop.
    Allow,
    /// Refuse and hand the request to the webview.
    Ask,
    /// Refuse and force the quit: the webview is not answering.
    Force,
}

/// What an exit request should do. Pure so the fallback is testable.
fn exit_action(
    now: Instant,
    last_ask: Option<Instant>,
    allow_exit: bool,
    has_window: bool,
) -> ExitAction {
    if allow_exit || !has_window {
        return ExitAction::Allow;
    }
    match last_ask {
        Some(at) if now.duration_since(at) < FORCE_EXIT_WINDOW => ExitAction::Force,
        _ => ExitAction::Ask,
    }
}

struct DaemonProcess {
    child: Mutex<Option<ManagedDaemon>>,
}

impl DaemonProcess {
    fn new(child: Option<ManagedDaemon>) -> Self {
        Self {
            child: Mutex::new(child),
        }
    }

    fn pid(&self) -> Option<u32> {
        self.child
            .lock()
            .ok()
            .and_then(|child| match child.as_ref()? {
                ManagedDaemon::Development(child) => Some(child.id()),
                ManagedDaemon::Sidecar(child) => Some(child.pid()),
            })
    }

    /// Ask the spawned daemon to stop (SIGTERM), wait up to `timeout` for it to
    /// exit, then kill it. The forced path and a timed-out `app.quit` never sent
    /// the stop request, so without the signal the daemon dies by SIGKILL and
    /// its service process groups and port-forwards are orphaned. A daemon the
    /// app did not spawn is not held here and is left running.
    fn terminate(&self, timeout: Duration) {
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
    // SAFETY: `kill` is async-signal-safe and `pid` is our own live child.
    unsafe {
        libc::kill(pid as libc::pid_t, libc::SIGTERM);
    }
}

#[cfg(not(unix))]
fn request_stop(_pid: u32) {}

/// Check whether a daemon is already listening by reading daemon.json and
/// attempting a TCP connect to its port. Used to avoid double-spawning.
fn is_daemon_running() -> bool {
    (|| -> Option<bool> {
        let path = dirs::home_dir()?.join(".warpforge").join("daemon.json");
        let text = std::fs::read_to_string(&path).ok()?;
        let ep: serde_json::Value = serde_json::from_str(&text).ok()?;
        // "ws://127.0.0.1:PORT" → "127.0.0.1:PORT"
        let url = ep["url"].as_str()?;
        let addr: std::net::SocketAddr = url.trim_start_matches("ws://").parse().ok()?;
        Some(
            std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(300))
                .is_ok(),
        )
    })()
    .unwrap_or(false)
}

/// Find the warpforge daemon binary.
///
/// Priority:
/// 1. `WARPFORGE_DAEMON_BIN` env var (explicit override)
/// 2. Sibling to current exe (prod app bundle)
/// 3. `workspace/target/debug/warpforge` (Tauri dev layout)
/// 4. `warpforge` on `PATH`
fn find_daemon_bin() -> std::path::PathBuf {
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

/// Read daemon.json, retrying for up to 5 s to give the daemon time to start.
#[tauri::command]
fn daemon_endpoint() -> Result<DaemonEndpoint, String> {
    let path = dirs::home_dir()
        .ok_or_else(|| "cannot determine home directory".to_string())?
        .join(".warpforge")
        .join("daemon.json");

    for _ in 0..50 {
        if let Ok(text) = std::fs::read_to_string(&path) {
            let endpoint: DaemonEndpoint =
                serde_json::from_str(&text).map_err(|e| format!("invalid daemon.json: {e}"))?;
            if endpoint.protocol_version != warpforge_protocol::PROTOCOL_VERSION {
                return Err(format!(
                    "incompatible daemon protocol {} (desktop requires {}); stop the running daemon and relaunch Warpforge",
                    endpoint.protocol_version,
                    warpforge_protocol::PROTOCOL_VERSION
                ));
            }
            if endpoint.version != env!("CARGO_PKG_VERSION") {
                return Err(format!(
                    "daemon version {} does not match desktop version {}; stop the running daemon and relaunch Warpforge",
                    endpoint.version,
                    env!("CARGO_PKG_VERSION")
                ));
            }
            return Ok(endpoint);
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }

    Err(format!(
        "daemon not ready — {} not found after 5 s",
        path.display()
    ))
}

/// The forced exit: stop the spawned daemon (bounded) and leave, without
/// waiting on the webview.
fn force_exit(app: &tauri::AppHandle) {
    ALLOW_EXIT.store(true, Ordering::SeqCst);
    let handle = app.clone();
    std::thread::spawn(move || {
        if let Some(daemon) = handle.try_state::<DaemonProcess>() {
            daemon.terminate(DAEMON_EXIT_TIMEOUT);
        }
        handle.exit(0);
    });
}

/// The final step of a quit, called by the web UI once it has asked a
/// desktop-owned daemon to stop.
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    force_exit(&app);
}

/// The webview has the quit request and is asking the user; stand the
/// no-answer fallback down.
#[tauri::command]
fn quit_ui_ready() {
    UI_ACK.store(true, Ordering::SeqCst);
}

fn main() {
    env_logger::init();
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            notifications::init();
            let sidecar_log = match SidecarLog::open() {
                Ok(log) => log,
                Err(error) => {
                    eprintln!("warpforge: could not initialize sidecar log ({error}) — degrading to stderr");
                    SidecarLog::disabled()
                }
            };
            if is_daemon_running() {
                eprintln!("warpforge: daemon already running — reusing");
                sidecar_log.lifecycle("reusing an already-running daemon");
                app.manage(DaemonProcess::new(None));
            } else {
                let explicit_bin = std::env::var_os("WARPFORGE_DAEMON_BIN");
                let spawned = if explicit_bin.is_some() || cfg!(debug_assertions) {
                    let bin = find_daemon_bin();
                    Command::new(&bin)
                        .args(["daemon", "--owner", "desktop"])
                        .spawn()
                        .map(ManagedDaemon::Development)
                        .map_err(|error| format!("could not spawn daemon ({bin:?}): {error}"))
                } else {
                    app.shell()
                        .sidecar("warpforge")
                        .map(|command| configure_sidecar_path(command, &sidecar_log))
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
                                        CommandEvent::Terminated(payload) => {
                                            event_log.lifecycle(&format!(
                                                "daemon terminated (code={:?}, signal={:?})",
                                                payload.code, payload.signal
                                            ))
                                        }
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
                        app.manage(daemon);
                    }
                    Err(error) => {
                        eprintln!("warning: {error}");
                        sidecar_log.error(&error);
                        app.manage(DaemonProcess::new(None));
                    }
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            let event_id = event.id().0.as_str();
            if let Some(rest) = event_id.strip_prefix("ctx:") {
                let mut parts = rest.splitn(2, ':');
                if let (Some(request_id), Some(item_id)) = (parts.next(), parts.next()) {
                    let _ = app.emit(
                        "context-menu:clicked",
                        serde_json::json!({
                            "requestId": request_id,
                            "itemId": item_id,
                        }),
                    );
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            daemon_endpoint,
            quit_app,
            quit_ui_ready,
            window::set_window_background_blur,
            window::enable_window_glass,
            window::disable_window_glass,
            notifications::notify_attention,
            notifications::withdraw_attention,
            context_menu::show_context_menu,
            browser::browser_open,
            browser::browser_navigate,
            browser::browser_back,
            browser::browser_forward,
            browser::browser_reload,
            browser::browser_stop,
            browser::browser_set_bounds,
            browser::browser_set_visible,
            browser::browser_close,
            browser::browser_close_project,
            browser::browser_pick,
            browser::browser_pick_stop,
            browser::browser_capture_element
        ])
        .plugin(tauri_plugin_dialog::init())
        .build(tauri::generate_context!())
        .expect("error building warpforge desktop")
        // One quit path for the window's close button, ⌘Q and Dock → Quit:
        // refuse the exit and let the web UI decide. It asks the daemon what is
        // running, asks the user if anything is, and calls `quit_app` to leave.
        // If the UI never answers, the fallback below forces the quit so the
        // app can always be left.
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let has_window = app_handle.get_webview_window("main").is_some();
                let now = Instant::now();
                let last_ask = LAST_ASK.lock().ok().and_then(|at| *at);
                match exit_action(now, last_ask, ALLOW_EXIT.load(Ordering::SeqCst), has_window) {
                    ExitAction::Allow => {}
                    ExitAction::Force => {
                        api.prevent_exit();
                        force_exit(app_handle);
                    }
                    ExitAction::Ask => {
                        api.prevent_exit();
                        UI_ACK.store(false, Ordering::SeqCst);
                        if let Ok(mut at) = LAST_ASK.lock() {
                            *at = Some(now);
                        }
                        let _ = app_handle.emit("app:quit-requested", ());
                        let handle = app_handle.clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(QUIT_FALLBACK);
                            if !ALLOW_EXIT.load(Ordering::SeqCst)
                                && !UI_ACK.load(Ordering::SeqCst)
                            {
                                force_exit(&handle);
                            }
                        });
                    }
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exit_is_allowed_once_the_app_may_leave_or_the_window_is_gone() {
        let now = Instant::now();
        assert_eq!(exit_action(now, None, true, true), ExitAction::Allow);
        assert_eq!(exit_action(now, None, false, false), ExitAction::Allow);
    }

    #[test]
    fn the_first_request_is_handed_to_the_ui() {
        assert_eq!(
            exit_action(Instant::now(), None, false, true),
            ExitAction::Ask
        );
    }

    #[test]
    fn a_repeat_request_inside_the_window_forces_the_exit() {
        let now = Instant::now();
        let last = now - Duration::from_secs(1);
        assert_eq!(exit_action(now, Some(last), false, true), ExitAction::Force);
    }

    #[test]
    fn a_repeat_request_after_the_window_asks_again() {
        let now = Instant::now();
        let last = now - FORCE_EXIT_WINDOW - Duration::from_secs(1);
        assert_eq!(exit_action(now, Some(last), false, true), ExitAction::Ask);
    }

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
}
