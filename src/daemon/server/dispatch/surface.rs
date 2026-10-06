//! Docs index, task fork, and project channel.

use crate::daemon::actor::DaemonHandle;
use crate::daemon::server::util::{project_path, rpc_err};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use warpforge_protocol as wire;

const SKIP: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    warpforge_protocol::identity::DIR,
];
const DOC_CAP: usize = 200;

pub(super) async fn docs_list(
    handle: &DaemonHandle,
    project: String,
) -> Result<Value, wire::RpcError> {
    let root = project_path(handle, &project).await?;
    let mut docs = Vec::new();
    walk_docs(Path::new(&root), Path::new(&root), &mut docs);
    docs.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    Ok(json!({ "docs": docs }))
}

pub(super) async fn docs_write(
    handle: &DaemonHandle,
    project: String,
    path: String,
    content: String,
) -> Result<Value, wire::RpcError> {
    let root = project_path(handle, &project).await?;
    let full = markdown_path(Path::new(&root), &path)?;
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(rpc_err)?;
    }
    std::fs::write(&full, content).map_err(rpc_err)?;
    Ok(json!({ "path": path }))
}

pub(super) async fn session_fork(
    handle: &DaemonHandle,
    task_id: String,
) -> Result<Value, wire::RpcError> {
    let tasks = handle.tasks().await;
    let Some(task) = tasks.iter().find(|task| task.id == task_id) else {
        return Err(wire::RpcError {
            code: wire::ErrorCode::NotFound,
            message: format!("unknown task {task_id}"),
        });
    };
    let id = handle
        .create_task(
            &task.project,
            &task.prompt,
            &task.agent,
            vec![format!("fork:{task_id}")],
            true,
            task.worktree.is_some(),
            Some(task_id),
            Vec::new(),
            None,
            std::collections::HashMap::new(),
            None,
        )
        .await;
    if id.is_empty() {
        return Err(wire::RpcError {
            code: wire::ErrorCode::Internal,
            message: "the daemon did not start the forked task".into(),
        });
    }
    Ok(json!({ "taskId": id }))
}

pub(super) async fn channel_list(
    handle: &DaemonHandle,
    project: String,
) -> Result<Value, wire::RpcError> {
    let root = project_path(handle, &project).await?;
    Ok(json!({ "messages": read_channel(Path::new(&root)) }))
}

pub(super) async fn channel_post(
    handle: &DaemonHandle,
    project: String,
    author: String,
    role: String,
    body: String,
) -> Result<Value, wire::RpcError> {
    let body = body.trim().to_string();
    if body.is_empty() {
        return Err(wire::RpcError {
            code: wire::ErrorCode::InvalidRequest,
            message: "a channel message needs text".into(),
        });
    }
    let root = PathBuf::from(project_path(handle, &project).await?);
    let mut messages = read_channel(&root);
    let role = if role == "agent" { "agent" } else { "human" };
    let at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let message = json!({
        "id": format!("{at}-{}", messages.len()),
        "author": if author.trim().is_empty() { "you".into() } else { author },
        "role": role,
        "body": body,
        "at": at,
    });
    messages.push(message.clone());
    write_channel(&root, &messages)?;
    Ok(message)
}

fn walk_docs(root: &Path, dir: &Path, out: &mut Vec<Value>) {
    if out.len() >= DOC_CAP {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= DOC_CAP {
            return;
        }
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if path.is_dir() {
            if SKIP.contains(&name.as_ref()) || (name.starts_with('.') && name != ".github") {
                continue;
            }
            walk_docs(root, &path, out);
            continue;
        }
        if !is_markdown(&name) {
            continue;
        }
        let Ok(rel) = path.strip_prefix(root) else {
            continue;
        };
        let text = std::fs::read_to_string(&path).unwrap_or_default();
        let updated = std::fs::metadata(&path)
            .and_then(|meta| meta.modified())
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|time| time.as_secs())
            .unwrap_or(0);
        out.push(json!({
            "path": rel.to_string_lossy(),
            "title": title_of(&name, &text),
            "updated": updated,
            "snippet": snippet_of(&text),
        }));
    }
}

fn snippet_of(text: &str) -> String {
    let flat = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut snippet: String = flat.chars().take(160).collect();
    if flat.chars().count() > 160 {
        snippet.push('…');
    }
    snippet
}

fn title_of(name: &str, text: &str) -> String {
    text.lines().find_map(atx_title).unwrap_or_else(|| {
        name.trim_end_matches(".mdx")
            .trim_end_matches(".md")
            .to_string()
    })
}

/// An ATX heading (`#` through `######`) with the marks removed.
fn atx_title(line: &str) -> Option<String> {
    let line = line.trim();
    let hashes = line.bytes().take_while(|byte| *byte == b'#').count();
    if !(1..=6).contains(&hashes) {
        return None;
    }
    let after = &line[hashes..];
    if !after.starts_with(' ') && !after.starts_with('\t') {
        return None;
    }
    let title = after.trim();
    if title.is_empty() {
        None
    } else {
        Some(title.to_string())
    }
}

fn is_markdown(name: &str) -> bool {
    name.ends_with(".md") || name.ends_with(".mdx")
}

fn markdown_path(root: &Path, rel: &str) -> Result<PathBuf, wire::RpcError> {
    let bad = || wire::RpcError {
        code: wire::ErrorCode::InvalidRequest,
        message: "docs are markdown files inside the project".into(),
    };
    if rel.is_empty() || !is_markdown(rel) || rel.contains('\0') {
        return Err(bad());
    }
    let rel_path = Path::new(rel);
    if rel_path.is_absolute()
        || rel_path
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err(bad());
    }
    let full = root.join(rel_path);
    if !full.starts_with(root) {
        return Err(bad());
    }
    Ok(full)
}

fn channel_file(root: &Path) -> PathBuf {
    root.join(warpforge_protocol::identity::DIR)
        .join("channel.json")
}

fn read_channel(root: &Path) -> Vec<Value> {
    let Ok(text) = std::fs::read_to_string(channel_file(root)) else {
        return Vec::new();
    };
    serde_json::from_str::<Value>(&text)
        .ok()
        .and_then(|value| value.get("messages").cloned())
        .and_then(|messages| serde_json::from_value(messages).ok())
        .unwrap_or_default()
}

fn write_channel(root: &Path, messages: &[Value]) -> Result<(), wire::RpcError> {
    let file = channel_file(root);
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(rpc_err)?;
    }
    let text = serde_json::to_string_pretty(&json!({ "messages": messages })).map_err(rpc_err)?;
    std::fs::write(file, text).map_err(rpc_err)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn docs_index_includes_mdx_and_skips_other_files() {
        let root = std::env::temp_dir().join(format!(
            "wf-docs-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("node_modules")).unwrap();
        std::fs::write(root.join("README.md"), "# Read\n").unwrap();
        std::fs::write(root.join("guide.mdx"), "## Guide\n\nThe columns stay.\n").unwrap();
        std::fs::create_dir_all(root.join(".github")).unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(
            root.join(".github/pull_request_template.md"),
            "# Pull request\n",
        )
        .unwrap();
        std::fs::write(root.join(".git/hidden.md"), "# Hidden\n").unwrap();
        std::fs::write(root.join("notes.txt"), "nope").unwrap();
        std::fs::write(root.join("node_modules/skip.md"), "# Skip\n").unwrap();
        let mut docs = Vec::new();
        walk_docs(&root, &root, &mut docs);
        let _ = std::fs::remove_dir_all(&root);
        let paths: Vec<&str> = docs.iter().filter_map(|doc| doc["path"].as_str()).collect();
        assert!(paths.iter().any(|path| path.ends_with("README.md")));
        assert!(paths.iter().any(|path| path.ends_with("guide.mdx")));
        let guide = docs
            .iter()
            .find(|doc| {
                doc["path"]
                    .as_str()
                    .is_some_and(|path| path.ends_with("guide.mdx"))
            })
            .unwrap();
        assert_eq!(guide["title"], "Guide");
        assert!(guide["snippet"]
            .as_str()
            .unwrap_or("")
            .contains("The columns stay."));
        assert!(guide["updated"].as_u64().unwrap_or(0) > 0);
        assert!(paths.iter().all(|path| !path.ends_with("notes.txt")));
        assert!(paths.iter().all(|path| !path.contains("skip.md")));
        assert!(paths
            .iter()
            .any(|path| path.ends_with("pull_request_template.md")));
        assert!(paths.iter().all(|path| !path.contains(".git/")));
    }
}
