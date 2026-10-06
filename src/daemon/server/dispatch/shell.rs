//! The sidebar command bar: run a shell command, and list the commands the
//! project declares (package scripts, just recipes, Makefile targets).

use crate::daemon::actor::DaemonHandle;
use crate::daemon::server::util::{project_path, rpc_err};
use serde_json::{json, Value};
use std::path::Path;
use warpforge_protocol as wire;

pub(super) async fn shell_run(
    handle: &DaemonHandle,
    project: String,
    command: String,
    task_id: Option<String>,
) -> Result<Value, wire::RpcError> {
    let command = command.trim().to_string();
    if command.is_empty() || command.len() > 4_000 {
        return Err(wire::RpcError {
            code: wire::ErrorCode::InvalidRequest,
            message: "the command is empty or longer than 4000 characters".into(),
        });
    }
    let root = project_path(handle, &project).await?;
    let cwd = shell_cwd(handle, &root, task_id.as_deref()).await;
    let mut child = tokio::process::Command::new("sh");
    child
        .arg("-c")
        .arg(&command)
        .current_dir(&cwd)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    let ran = tokio::time::timeout(std::time::Duration::from_secs(30), child.output()).await;
    let output = match ran {
        Ok(Ok(output)) => output,
        Ok(Err(error)) => return Err(rpc_err(error)),
        Err(_) => {
            return Err(wire::RpcError {
                code: wire::ErrorCode::Internal,
                message: "the command ran longer than 30 seconds".into(),
            });
        }
    };
    Ok(json!({
        "code": output.status.code(),
        "stdout": clip(&output.stdout),
        "stderr": clip(&output.stderr),
        "cwd": cwd,
    }))
}

/// What the command bar offers: everything the project declares where
/// `shell.run` would run, read off the actor loop.
pub(super) async fn shell_commands(
    handle: &DaemonHandle,
    project: String,
    task_id: Option<String>,
) -> Result<Value, wire::RpcError> {
    let root = project_path(handle, &project).await?;
    let cwd = shell_cwd(handle, &root, task_id.as_deref()).await;
    let repo_root = std::path::PathBuf::from(&root);
    let found = tokio::task::spawn_blocking(move || {
        crate::daemon::runners::detect(Path::new(&cwd), &repo_root)
    })
    .await
    .map_err(rpc_err)?;
    serde_json::to_value(found).map_err(rpc_err)
}

async fn shell_cwd(handle: &DaemonHandle, root: &str, task_id: Option<&str>) -> String {
    let Some(task_id) = task_id else {
        return root.to_string();
    };
    let tasks = handle.tasks().await;
    tasks
        .iter()
        .find(|task| task.id == task_id)
        .and_then(|task| task.worktree.clone())
        .filter(|path| Path::new(path).is_dir())
        .unwrap_or_else(|| root.to_string())
}

fn clip(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    const MAX: usize = 32_000;
    if text.len() <= MAX {
        return text.into_owned();
    }
    let mut end = MAX;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &text[..end])
}
