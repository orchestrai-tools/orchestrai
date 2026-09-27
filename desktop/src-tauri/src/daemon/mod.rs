//! The daemon the app talks to: reused when the one in `daemon.json` answers,
//! otherwise spawned and held so a quit can stop it.

use std::process::Child;
use std::sync::Mutex;

use tauri_plugin_shell::process::CommandChild;

pub(crate) mod endpoint;
mod probe;
mod spawn;
mod startup;
mod stop;

pub(crate) use startup::start;

enum ManagedDaemon {
    Development(Child),
    Sidecar(CommandChild),
}

pub(crate) struct DaemonProcess {
    child: Mutex<Option<ManagedDaemon>>,
    /// Why the daemon found at launch cannot be used; `daemon_endpoint`
    /// returns it to the UI in place of an endpoint.
    unusable: Option<String>,
}

impl DaemonProcess {
    fn new(child: Option<ManagedDaemon>) -> Self {
        Self {
            child: Mutex::new(child),
            unusable: None,
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
}
