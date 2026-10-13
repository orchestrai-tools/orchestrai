//! Committing staged work, and rejecting one hunk of it. "Accept" is a no-op
//! on the tree; only reject touches files.

use std::process::Stdio;

use anyhow::{anyhow, bail, Result};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use warpforge_protocol as wire;

use super::working::{tracked_diff, working_diff};

fn git_command(repo: &str) -> Command {
    let mut command = Command::new("git");
    command.args(["--literal-pathspecs", "-C", repo]);
    command
}

fn validate_paths(paths: &[String]) -> Result<()> {
    use std::path::Component;
    if paths.is_empty() {
        bail!("nothing selected to commit");
    }
    for path in paths {
        let mut components = std::path::Path::new(path).components();
        if !components.any(|part| matches!(part, Component::Normal(_)))
            || !std::path::Path::new(path)
                .components()
                .all(|part| matches!(part, Component::Normal(_) | Component::CurDir))
            || (cfg!(windows) && path.contains(['\\', ':']))
        {
            bail!("refusing unsafe relative path: {path}");
        }
    }
    Ok(())
}

/// Stage files (all changes if `files` is None, else exactly those paths) and
/// commit them. `amend` rewrites the previous commit instead of creating a new
/// one. Returns git's stderr on failure.
pub async fn commit(
    repo: &str,
    message: &str,
    files: Option<&[String]>,
    amend: bool,
) -> Result<()> {
    if let Some(paths) = files {
        validate_paths(paths)?;
    }
    // A rename is one displayed change: its old path must leave HEAD too.
    // Unstaged deletes shown separately remain separate selected changes.
    let selected = if let Some(paths) = files {
        let mut selected = paths.to_vec();
        for change in tracked_diff(repo).await? {
            if paths.contains(&change.path) {
                if let Some(old) = change.old_path.filter(|old| old != &change.path) {
                    if !selected.contains(&old) {
                        selected.push(old);
                    }
                }
            }
        }
        Some(selected)
    } else {
        None
    };
    // Missing selected paths are deletions. --only records them from HEAD,
    // including deletions already staged (which git add would refuse).
    let paths_to_stage = match &selected {
        Some(paths) => paths
            .iter()
            .filter_map(|path| {
                match std::fs::symlink_metadata(std::path::Path::new(repo).join(path)) {
                    Ok(_) => Some(Ok(path.clone())),
                    Err(err) if err.kind() == std::io::ErrorKind::NotFound => None,
                    Err(err) => Some(Err(err)),
                }
            })
            .collect::<std::io::Result<Vec<_>>>()?,
        None => vec![".".to_string()],
    };
    let mut add = git_command(repo);
    add.args(["add", "--"]);
    if !paths_to_stage.is_empty() {
        let out = add.args(&paths_to_stage).output().await?;
        if !out.status.success() {
            bail!(
                "git add failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            );
        }
    }

    // Commit. An empty box on amend means "same message, new content" — the UI
    // allows it deliberately — so reuse the previous message instead of handing
    // git an empty `-m`, which it refuses.
    let mut ci = git_command(repo);
    ci.arg("commit");
    if amend {
        ci.arg("--amend");
        if message.trim().is_empty() {
            ci.arg("--no-edit");
        } else {
            ci.args(["-m", message]);
        }
    } else {
        ci.args(["-m", message]);
    }
    // Staging just these files does not exclude unrelated changes already in
    // the index. --only commits the selection and preserves those staged edits.
    if let Some(paths) = &selected {
        ci.args(["--only", "--"]).args(paths);
    }
    let out = ci.output().await?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let stdout = String::from_utf8_lossy(&out.stdout);
        let msg = if stderr.trim().is_empty() {
            stdout
        } else {
            stderr
        };
        bail!("git commit failed: {}", msg.trim());
    }
    Ok(())
}

/// `git add` exactly these paths, without committing. "Add to VCS" for
/// unversioned files: after this they show up as tracked changes. Refuses
/// `..` escapes and empty lists — both are caller bugs, not git invocations.
pub async fn stage_paths(repo: &str, paths: &[String]) -> Result<()> {
    validate_paths(paths)?;
    let mut add = git_command(repo);
    add.args(["add", "--"]).args(paths);
    let out = add.output().await?;
    if !out.status.success() {
        bail!(
            "git add failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(())
}

/// Full message (subject and body) of the repo's most recent commit. Returns an
/// empty string when there is nothing to read — a fresh repo with no commits is
/// not an error for callers, just nothing to amend.
pub async fn last_commit_message(repo: &str) -> Result<String> {
    let out = Command::new("git")
        .args(["-C", repo, "log", "-1", "--pretty=%B"])
        .output()
        .await?;
    if !out.status.success() {
        return Ok(String::new());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim_end().to_string())
}

/// Revert exactly one hunk of one file in the working tree.
pub async fn reject_hunk(repo: &str, file: &str, hunk_index: u32) -> Result<()> {
    let files = working_diff(repo).await?;
    let f = files
        .iter()
        .find(|f| f.path == file)
        .ok_or_else(|| anyhow!("file not in diff: {file}"))?;

    // Rejecting an added file means removing it.
    if f.status == wire::FileDiffStatus::Added {
        std::fs::remove_file(std::path::Path::new(repo).join(file))?;
        return Ok(());
    }

    let hunk = f
        .hunks
        .get(hunk_index as usize)
        .ok_or_else(|| anyhow!("hunk {hunk_index} out of range for {file}"))?;

    let patch = build_patch(f, hunk);
    let mut child = Command::new("git")
        .args([
            "-C",
            repo,
            "apply",
            "-R",
            "--recount",
            "--unidiff-zero",
            "-",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(patch.as_bytes()).await?;
        stdin.flush().await?;
        drop(stdin);
    }
    let out = child.wait_with_output().await?;
    if !out.status.success() {
        bail!(
            "git apply -R failed: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(())
}

fn build_patch(f: &wire::FileDiff, h: &wire::Hunk) -> String {
    let old = f.old_path.as_deref().unwrap_or(&f.path);
    let mut s = String::new();
    s.push_str(&format!("--- a/{old}\n+++ b/{}\n", f.path));
    s.push_str(&format!(
        "@@ -{},{} +{},{} @@\n",
        h.old_start, h.old_lines, h.new_start, h.new_lines
    ));
    for line in &h.lines {
        s.push_str(line);
        s.push('\n');
    }
    s
}

#[cfg(test)]
mod selection_tests;
#[cfg(test)]
mod tests;
