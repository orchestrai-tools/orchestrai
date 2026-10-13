//! Reading and writing single files in a checkout — the editor's side of the
//! review surface.

use anyhow::{bail, Result};
use tokio::process::Command;
use warpforge_protocol as wire;

/// A file's old (HEAD) and new (working-tree) text, for the editable review.
pub async fn file_doc(repo: &str, path: &str) -> Result<wire::FileDoc> {
    let full = resolve_target_in_root(repo, path)?;

    if is_image_path(path) {
        return file_doc_binary(repo, path, &full).await;
    }

    let show = Command::new("git")
        .args(["-C", repo, "show", &format!("HEAD:{path}")])
        .output()
        .await?;
    let in_head = show.status.success();
    let old_text = if in_head {
        decode_text(&show.stdout, path)?.to_string()
    } else {
        String::new()
    };

    let in_tree = full.is_file();
    let new_text = if in_tree {
        decode_text(&std::fs::read(&full)?, path)?.to_string()
    } else {
        String::new()
    };

    let status = match (in_head, in_tree) {
        (true, true) => wire::FileDiffStatus::Modified,
        (false, true) => wire::FileDiffStatus::Added,
        (true, false) => wire::FileDiffStatus::Deleted,
        (false, false) => wire::FileDiffStatus::Modified,
    };
    Ok(wire::FileDoc {
        path: path.to_string(),
        status,
        old_text,
        new_text,
        new_data_base64: None,
        old_data_base64: None,
    })
}

/// Binary file variant — returns base64-encoded content for images.
async fn file_doc_binary(repo: &str, path: &str, full: &std::path::Path) -> Result<wire::FileDoc> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    let show = Command::new("git")
        .args(["-C", repo, "show", &format!("HEAD:{path}")])
        .output()
        .await?;
    let in_head = show.status.success();
    let old_data_base64 = if in_head {
        Some(STANDARD.encode(&show.stdout))
    } else {
        None
    };

    let in_tree = full.is_file();
    let new_data_base64 = if in_tree {
        let bytes = std::fs::read(full)?;
        Some(STANDARD.encode(bytes))
    } else {
        None
    };

    let status = match (in_head, in_tree) {
        (true, true) => wire::FileDiffStatus::Modified,
        (false, true) => wire::FileDiffStatus::Added,
        (true, false) => wire::FileDiffStatus::Deleted,
        (false, false) => wire::FileDiffStatus::Modified,
    };
    Ok(wire::FileDoc {
        path: path.to_string(),
        status,
        old_text: String::new(),
        new_text: String::new(),
        new_data_base64,
        old_data_base64,
    })
}

/// Check if path is a binary image file.
fn is_image_path(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".ico")
        || lower.ends_with(".bmp")
}

/// Write new contents to a file in the working tree (an in-review edit).
pub fn save_file(repo: &str, path: &str, content: &str) -> Result<()> {
    let full = resolve_target_in_root(repo, path)?;
    decode_text(content.as_bytes(), path)?;
    // Even a stale editor cannot replace a binary file with empty text. The
    // file may have changed since its contents were read.
    match std::fs::read(&full) {
        Ok(bytes) => {
            decode_text(&bytes, path)?;
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(err.into()),
    }
    if let Some(dir) = full.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(full, content)?;
    Ok(())
}

fn decode_text<'a>(bytes: &'a [u8], path: &str) -> Result<&'a str> {
    if bytes.contains(&0) {
        bail!("{path} is a binary file and cannot be edited as text");
    }
    std::str::from_utf8(bytes)
        .map_err(|_| anyhow::anyhow!("{path} is not UTF-8 text and cannot be edited as text"))
}

/// Only plain names below the root: no root, prefix or `..` component. On
/// Windows `\` and `:` are refused too: `resolve_in_root` splits on `/` only,
/// and `:` also names a drive (`C:x`) or an alternate data stream.
fn validate_relative_path(path: &str) -> Result<()> {
    use std::path::Component;
    let plain = std::path::Path::new(path)
        .components()
        .all(|part| matches!(part, Component::Normal(_) | Component::CurDir));
    if path.is_empty() || !plain || (cfg!(windows) && path.contains(['\\', ':'])) {
        bail!("refusing unsafe relative path: {path}");
    }
    Ok(())
}

/// Resolve `path` under `repo`, following symlinks in its existing parent
/// directories and refusing anything that lands outside the root. The last
/// component is never followed: these ops act on a link, not on its target.
fn resolve_in_root(repo: &str, path: &str) -> Result<std::path::PathBuf> {
    validate_relative_path(path)?;
    let root = std::fs::canonicalize(repo)?;
    let parts: Vec<&str> = path
        .split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect();
    let Some((leaf, parents)) = parts.split_last() else {
        bail!("refusing unsafe relative path: {path}");
    };
    let mut dir = root.clone();
    for part in parents {
        let candidate = dir.join(part);
        dir = std::fs::canonicalize(&candidate).unwrap_or(candidate);
        if !dir.starts_with(&root) {
            bail!("refusing path outside the root: {path}");
        }
    }
    Ok(dir.join(leaf))
}

/// [`resolve_in_root`] for ops that read or write through the last component:
/// an existing leaf is followed too, so a link to a file outside is refused.
fn resolve_target_in_root(repo: &str, path: &str) -> Result<std::path::PathBuf> {
    let full = resolve_in_root(repo, path)?;
    if std::fs::symlink_metadata(&full).is_err() {
        return Ok(full);
    }
    let target = std::fs::canonicalize(&full)?;
    if !target.starts_with(std::fs::canonicalize(repo)?) {
        bail!("refusing path outside the root: {path}");
    }
    Ok(target)
}

pub fn create_file(repo: &str, path: &str, directory: bool) -> Result<()> {
    let full = resolve_in_root(repo, path)?;
    if directory {
        std::fs::create_dir_all(full)?;
    } else {
        if let Some(parent) = full.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(full)?;
    }
    Ok(())
}

pub fn rename_file(repo: &str, path: &str, new_path: &str) -> Result<()> {
    let from = resolve_in_root(repo, path)?;
    let to = resolve_in_root(repo, new_path)?;
    match std::fs::symlink_metadata(&to) {
        Ok(_) => bail!("cannot rename to {new_path}: that path already exists"),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(err.into()),
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::rename(from, to)?;
    Ok(())
}

pub fn delete_file(repo: &str, path: &str) -> Result<()> {
    let full = resolve_in_root(repo, path)?;
    let metadata = std::fs::symlink_metadata(&full)?;
    if metadata.is_dir() {
        std::fs::remove_dir_all(full)?;
    } else {
        std::fs::remove_file(full)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests;
