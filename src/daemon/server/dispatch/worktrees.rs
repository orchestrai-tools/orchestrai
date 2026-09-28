//! Server dispatcher topic: the per-project worktree inventory.

use std::path::{Path, PathBuf};

use serde_json::json;
use warpforge_protocol as wire;

use crate::daemon::actor::DaemonHandle;
use crate::daemon::task::{Task, TaskStatus};
use crate::daemon::worktree::{self, same_path};

const LOG_TAIL_BYTES: usize = 64 * 1024;

fn rpc(code: wire::ErrorCode, message: impl Into<String>) -> wire::RpcError {
    wire::RpcError {
        code,
        message: message.into(),
    }
}

async fn project_root(handle: &DaemonHandle, project: &str) -> Result<PathBuf, wire::RpcError> {
    handle
        .projects()
        .await
        .into_iter()
        .find(|p| p.name == project)
        .map(|p| PathBuf::from(p.path))
        .ok_or_else(|| {
            rpc(
                wire::ErrorCode::NotFound,
                format!("unknown project {project}"),
            )
        })
}

fn owner_of<'a>(tasks: &'a [Task], project: &str, path: &Path) -> Option<&'a Task> {
    tasks.iter().find(|t| {
        t.project == project
            && t.worktree
                .as_deref()
                .is_some_and(|w| same_path(Path::new(w), path))
    })
}

/// The listed worktree at `path`; a path git does not list as one of the
/// project's managed worktrees is refused, so a request cannot name a folder
/// of its own choosing.
async fn find_managed(root: &Path, path: &str) -> Result<worktree::Listed, wire::RpcError> {
    let listed = worktree::list_managed(root)
        .await
        .map_err(|e| rpc(wire::ErrorCode::Internal, format!("{e:#}")))?;
    listed
        .into_iter()
        .find(|l| same_path(&l.path, Path::new(path)))
        .ok_or_else(|| {
            rpc(
                wire::ErrorCode::NotFound,
                format!("{path} is not a project worktree"),
            )
        })
}

pub(super) async fn worktree_list(
    handle: &DaemonHandle,
    project: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let root = project_root(handle, &project).await?;
    let listed = worktree::list_managed(&root)
        .await
        .map_err(|e| rpc(wire::ErrorCode::Internal, format!("{e:#}")))?;
    let tasks = handle.tasks().await;
    let rows = listed.into_iter().map(|l| {
        let owner = owner_of(&tasks, &project, &l.path);
        let task_id = owner.map(|t| t.id.clone());
        let root = root.clone();
        async move {
            wire::WorktreeRow {
                size_bytes: worktree::cached_size(&l.path).await,
                has_setup_log: task_id
                    .as_deref()
                    .is_some_and(|id| worktree::setup_log_path(&root, id).exists()),
                orphan: owner.is_none(),
                task_title: owner.map(|t| t.title.clone()),
                task_id,
                branch: l.branch,
                path: l.path.to_string_lossy().into_owned(),
            }
        }
    });
    let rows = futures::future::join_all(rows).await;
    Ok(json!({ "worktrees": rows }))
}

pub(super) async fn worktree_reclaim(
    handle: &DaemonHandle,
    project: String,
    path: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let root = project_root(handle, &project).await?;
    let target = find_managed(&root, &path).await?;
    let tasks = handle.tasks().await;
    if owner_of(&tasks, &project, &target.path).is_some_and(|t| t.status == TaskStatus::Running) {
        return Err(rpc(
            wire::ErrorCode::Conflict,
            "wait for the agent to finish its turn",
        ));
    }
    let dir = target.path.clone();
    let freed = tokio::task::spawn_blocking(move || worktree::reclaim_artifacts(&dir))
        .await
        .map_err(|e| rpc(wire::ErrorCode::Internal, e.to_string()))?
        .map_err(|e| rpc(wire::ErrorCode::Internal, format!("{e:#}")));
    worktree::forget_size(&target.path);
    Ok(json!({ "freedBytes": freed? }))
}

pub(super) async fn worktree_remove_orphan(
    handle: &DaemonHandle,
    project: String,
    path: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let root = project_root(handle, &project).await?;
    let target = find_managed(&root, &path).await?;
    let tasks = handle.tasks().await;
    if owner_of(&tasks, &project, &target.path).is_some() {
        return Err(rpc(
            wire::ErrorCode::Conflict,
            "a task owns this worktree; archive the task to remove it",
        ));
    }
    if let Some(reason) =
        crate::daemon::pull_status::removal_blocker(&target.path.to_string_lossy(), None).await
    {
        return Err(rpc(wire::ErrorCode::Conflict, reason));
    }
    let branch = target.branch.as_deref().unwrap_or_default();
    worktree::remove_detached(&root, &target.path, branch)
        .await
        .map_err(|e| rpc(wire::ErrorCode::Internal, format!("{e:#}")))?;
    worktree::forget_size(&target.path);
    Ok(json!(null))
}

pub(super) async fn worktree_setup_log(
    handle: &DaemonHandle,
    task_id: String,
) -> Result<serde_json::Value, wire::RpcError> {
    let tasks = handle.tasks().await;
    let task = tasks
        .iter()
        .find(|t| t.id == task_id)
        .ok_or_else(|| rpc(wire::ErrorCode::NotFound, format!("unknown task {task_id}")))?;
    let root = project_root(handle, &task.project).await?;
    let bytes = std::fs::read(worktree::setup_log_path(&root, &task_id))
        .map_err(|_| rpc(wire::ErrorCode::NotFound, "no setup log for this task"))?;
    let start = bytes.len().saturating_sub(LOG_TAIL_BYTES);
    Ok(json!({ "log": String::from_utf8_lossy(&bytes[start..]) }))
}
