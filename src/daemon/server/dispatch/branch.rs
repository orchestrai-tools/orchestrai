//! Server dispatcher topic: branch.

use crate::daemon::actor::{DaemonHandle, RepoScope};
use warpforge_protocol as wire;

pub(super) async fn git_switch_branch(
    handle: &DaemonHandle,
    scope: RepoScope,
    branch: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let result = handle.git_switch_branch(scope, &branch).await;
    serde_json::to_value(result).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn git_branch_rename(
    handle: &DaemonHandle,
    scope: RepoScope,
    branch: String,
    new_name: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let result = handle.git_branch_rename(scope, &branch, &new_name).await;
    serde_json::to_value(result).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn git_branch_delete(
    handle: &DaemonHandle,
    scope: RepoScope,
    branch: String,
    force: bool,
) -> Result<serde_json::Value, wire::RpcError> {
    let result = handle.git_branch_delete(scope, &branch, force).await;
    serde_json::to_value(result).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn git_branch_create(
    handle: &DaemonHandle,
    scope: RepoScope,
    name: String,
    from: Option<String>,
    checkout: bool,
    overwrite: bool,
) -> Result<serde_json::Value, wire::RpcError> {
    let result = handle
        .git_branch_create(scope, &name, from, checkout, overwrite)
        .await;
    serde_json::to_value(result).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn git_rebase(
    handle: &DaemonHandle,
    scope: RepoScope,
    branch: String,
    target: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let result = handle.git_rebase(scope, &branch, &target).await;
    serde_json::to_value(result).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}

pub(super) async fn git_merge(
    handle: &DaemonHandle,
    scope: RepoScope,
    target: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let result = handle.git_merge(scope, &target).await;
    serde_json::to_value(result).map_err(|e| wire::RpcError {
        code: wire::ErrorCode::Internal,
        message: e.to_string(),
    })
}
