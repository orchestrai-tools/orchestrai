//! Server dispatcher topic: system.

use crate::daemon::actor::DaemonHandle;
use crate::daemon::server::ServerLifecycle;
use serde_json::json;
use std::sync::atomic::Ordering;
use warpforge_protocol as wire;

pub(super) async fn system_handshake(
    handle: &DaemonHandle,
    lifecycle: &std::sync::Arc<ServerLifecycle>,
    client_version: String,
    protocol_version: u32,
) -> Result<serde_json::Value, wire::RpcError> {
    // The reply below needs no actor, so a daemon whose actor has died would
    // otherwise pass the handshake and then answer everything with defaults.
    if handle.cmd_tx.is_closed() {
        return Err(wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: "the daemon has stopped working; quit and relaunch Warpforge to restart it"
                .into(),
        });
    }
    Ok(json!(wire::DaemonHandshake {
        daemon_version: env!("CARGO_PKG_VERSION").into(),
        protocol_version: wire::PROTOCOL_VERSION,
        owner: lifecycle.owner,
        protocol_compatible: protocol_version == wire::PROTOCOL_VERSION,
        exact_version_match: client_version == env!("CARGO_PKG_VERSION"),
    }))
}

pub(super) async fn update_prepare_shutdown(
    handle: &DaemonHandle,
    lifecycle: &std::sync::Arc<ServerLifecycle>,
    expected_daemon_version: String,
    protocol_version: u32,
) -> Result<serde_json::Value, wire::RpcError> {
    if lifecycle.owner != wire::DaemonOwner::Desktop {
        return Err(wire::RpcError {
            code: wire::ErrorCode::Conflict,
            message: "the running daemon was started externally; stop it before updating".into(),
        });
    }
    if protocol_version != wire::PROTOCOL_VERSION
        || expected_daemon_version != env!("CARGO_PKG_VERSION")
    {
        return Err(wire::RpcError {
                code: wire::ErrorCode::Conflict,
                message: format!(
                    "daemon compatibility changed (expected version {expected_daemon_version}, protocol {protocol_version}; running version {}, protocol {})",
                    env!("CARGO_PKG_VERSION"),
                    wire::PROTOCOL_VERSION
                ),
            });
    }

    // Wait for every mutation that already passed the gate to enqueue
    // (or complete) before taking the actor's safety snapshot.
    let _mutation_guard = lifecycle.mutations.write().await;

    if lifecycle
        .quiescing
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Err(wire::RpcError {
            code: wire::ErrorCode::Updating,
            message: "an update handoff is already in progress".into(),
        });
    }

    let blockers = handle.update_blockers().await;
    if !blockers.is_empty() {
        lifecycle.quiescing.store(false, Ordering::Release);
        return Ok(json!(wire::UpdateHandoff {
            ready: false,
            blockers,
        }));
    }

    Ok(json!(wire::UpdateHandoff {
        ready: true,
        blockers: Vec::new(),
    }))
}

/// What a quit would stop, and whether this daemon may be shut down by the
/// asking app. Read-only, so any client can ask.
pub(super) async fn app_quit_check(
    handle: &DaemonHandle,
    lifecycle: &std::sync::Arc<ServerLifecycle>,
) -> Result<serde_json::Value, wire::RpcError> {
    Ok(json!(wire::QuitCheck {
        blockers: handle.quit_blockers().await,
        owned: lifecycle.owner == wire::DaemonOwner::Desktop,
    }))
}

/// Stop everything and end a desktop-owned daemon. A daemon started outside the
/// app is refused and left running — the caller then exits without it.
pub(super) async fn app_quit(
    handle: &DaemonHandle,
    lifecycle: &std::sync::Arc<ServerLifecycle>,
) -> Result<serde_json::Value, wire::RpcError> {
    if lifecycle.owner != wire::DaemonOwner::Desktop {
        return Err(wire::RpcError {
            code: wire::ErrorCode::Conflict,
            message: "the running daemon was started externally; leaving it running".into(),
        });
    }
    // Tears down services, port-forwards and agent sessions, then ends the
    // actor loop. The connection loop stops the server after the reply is sent.
    handle.shutdown().await;
    Ok(json!(null))
}

pub(super) async fn state_subscribe() -> Result<serde_json::Value, wire::RpcError> {
    Ok(json!(null))
    // handled by caller
}
