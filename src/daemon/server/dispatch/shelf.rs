//! Server dispatcher topic: shelf.

use crate::daemon::actor::{DaemonHandle, RepoScope};
use serde_json::json;
use warpforge_protocol as wire;

pub(super) async fn shelf_list(
    handle: &DaemonHandle,
    scope: RepoScope,
) -> Result<serde_json::Value, wire::RpcError> {
    let list = handle.shelf_list(scope).await;
    serde_json::to_value(list).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn shelf_create(
    handle: &DaemonHandle,
    scope: RepoScope,
    name: String,
    paths: Option<Vec<String>>,
) -> Result<serde_json::Value, wire::RpcError> {
    let entry = handle
        .shelf_create(scope, name, paths)
        .await
        .map_err(|e| wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: e,
        })?;
    serde_json::to_value(entry).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn shelf_get(
    handle: &DaemonHandle,
    scope: RepoScope,
    id: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let diff = handle
        .shelf_get(scope, &id)
        .await
        .map_err(|e| wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: e,
        })?;
    serde_json::to_value(diff).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn shelf_apply(
    handle: &DaemonHandle,
    scope: RepoScope,
    id: String,
    drop: bool,
) -> Result<serde_json::Value, wire::RpcError> {
    handle
        .shelf_apply(scope, &id, drop)
        .await
        .map_err(|e| wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: e,
        })?;
    Ok(json!(null))
}

pub(super) async fn shelf_drop(
    handle: &DaemonHandle,
    scope: RepoScope,
    id: String,
) -> Result<serde_json::Value, wire::RpcError> {
    handle
        .shelf_drop(scope, &id)
        .await
        .map_err(|e| wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: e,
        })?;
    Ok(json!(null))
}

pub(super) async fn stash_list(
    handle: &DaemonHandle,
    scope: RepoScope,
) -> Result<serde_json::Value, wire::RpcError> {
    let list = handle.stash_list(scope).await;
    serde_json::to_value(list).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn stash_push(
    handle: &DaemonHandle,
    scope: RepoScope,
    message: String,
    paths: Option<Vec<String>>,
) -> Result<serde_json::Value, wire::RpcError> {
    let entry = handle
        .stash_push(scope, message, paths)
        .await
        .map_err(|e| wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: e,
        })?;
    serde_json::to_value(entry).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn stash_get(
    handle: &DaemonHandle,
    scope: RepoScope,
    id: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let diff = handle
        .stash_get(scope, &id)
        .await
        .map_err(|e| wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: e,
        })?;
    serde_json::to_value(diff).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn stash_apply(
    handle: &DaemonHandle,
    scope: RepoScope,
    id: String,
    pop: bool,
) -> Result<serde_json::Value, wire::RpcError> {
    handle
        .stash_apply(scope, &id, pop)
        .await
        .map_err(|e| wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: e,
        })?;
    Ok(json!(null))
}

pub(super) async fn stash_file(
    handle: &DaemonHandle,
    scope: RepoScope,
    id: String,
    paths: Vec<String>,
) -> Result<serde_json::Value, wire::RpcError> {
    handle
        .stash_checkout_file(scope, &id, paths)
        .await
        .map_err(|e| wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: e,
        })?;
    Ok(json!(null))
}

pub(super) async fn stash_drop(
    handle: &DaemonHandle,
    scope: RepoScope,
    id: String,
) -> Result<serde_json::Value, wire::RpcError> {
    handle
        .stash_drop(scope, &id)
        .await
        .map_err(|e| wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: e,
        })?;
    Ok(json!(null))
}
