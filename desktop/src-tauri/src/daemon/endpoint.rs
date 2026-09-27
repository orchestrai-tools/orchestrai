//! `~/.warpforge/daemon.json`: written by a daemon once it is listening.

use warpforge_protocol::DaemonEndpoint;

use super::DaemonProcess;

pub(super) fn read_endpoint() -> Option<DaemonEndpoint> {
    let path = dirs::home_dir()?.join(".warpforge").join("daemon.json");
    serde_json::from_str(&std::fs::read_to_string(path).ok()?).ok()
}

/// Read daemon.json, retrying for up to 5 s to give the daemon time to start.
#[tauri::command]
pub(crate) fn daemon_endpoint(
    daemon: tauri::State<'_, DaemonProcess>,
) -> Result<DaemonEndpoint, String> {
    if let Some(reason) = &daemon.unusable {
        return Err(reason.clone());
    }
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
