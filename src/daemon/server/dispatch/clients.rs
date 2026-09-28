//! Server dispatcher topic: requests the daemon sends to clients.

use std::sync::Arc;

use warpforge_protocol as wire;

use crate::daemon::actor::DaemonHandle;
use crate::daemon::server::ServerLifecycle;

/// `client.register` and `client.reply` are answered by the connection loop,
/// which knows which connection sent them; they never reach the dispatcher.
pub(super) async fn connection_scoped() -> Result<serde_json::Value, wire::RpcError> {
    Err(wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: "handled by the connection".into(),
    })
}

pub(super) async fn browser_act(
    handle: &DaemonHandle,
    lifecycle: &Arc<ServerLifecycle>,
    project: String,
    task_id: String,
    action: wire::BrowserAction,
) -> Result<serde_json::Value, wire::RpcError> {
    crate::daemon::browser::act(
        handle,
        &lifecycle.clients,
        &lifecycle.browser_grants,
        &project,
        &task_id,
        action,
    )
    .await
    .map_err(|message| wire::RpcError {
        code: wire::ErrorCode::InvalidRequest,
        message,
    })
}
