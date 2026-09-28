//! The project's `worktree:` config applied to a new checkout: copy files from
//! the project root, then run the setup command (ADR 0015). Runs off the actor
//! like the checkout itself (ADR 0002); a failure never removes the worktree.

use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{bail, Context, Result};
use walkdir::WalkDir;

use super::{Worktree, WORKTREES_REL};
use crate::daemon::diff::HEAVY_DIRS;
use crate::worktree_config::WorktreeConfig;

const SETUP_TIMEOUT: Duration = Duration::from_secs(600);
const ERROR_TAIL_LINES: usize = 5;

/// Where a task's setup output is kept, beside the worktree folders.
///
/// @param base_repo The project root.
/// @param task_id The task the worktree belongs to.
/// @returns The log file path; it exists only after a setup command ran.
pub fn setup_log_path(base_repo: &Path, task_id: &str) -> PathBuf {
    base_repo
        .join(WORKTREES_REL)
        .join(format!("{task_id}.setup.log"))
}

/// Apply the project's `worktree:` section to a freshly created checkout.
///
/// @param base_repo The project root, which holds the config and the files to copy.
/// @param wt The new worktree.
/// @returns A message describing what failed, or `None` when there was nothing
/// to do or everything succeeded.
pub async fn apply_config(base_repo: &Path, wt: &Worktree) -> Option<String> {
    let config = match crate::config::try_load_workspace_config(base_repo) {
        Ok(config) => config?.worktree?,
        Err(e) => return Some(format!("{e:#}")),
    };
    apply(base_repo, &wt.path, &wt.task_id, &config, SETUP_TIMEOUT).await
}

pub(super) async fn apply(
    base_repo: &Path,
    dest: &Path,
    task_id: &str,
    config: &WorktreeConfig,
    timeout: Duration,
) -> Option<String> {
    if !config.copy.is_empty() {
        let (root, dest, patterns) = (base_repo.to_owned(), dest.to_owned(), config.copy.clone());
        match tokio::task::spawn_blocking(move || copy_files(&root, &dest, &patterns)).await {
            Ok(Ok(_)) => {}
            Ok(Err(e)) => return Some(format!("copying files failed: {e:#}")),
            Err(e) => return Some(format!("copying files failed: {e}")),
        }
    }
    let command = config.setup.as_deref()?;
    let log = setup_log_path(base_repo, task_id);
    run_setup(command, dest, &log, timeout)
        .await
        .err()
        .map(|e| format!("{e:#}"))
}

/// Copy the regular files under `root` that match `patterns` into `dest`,
/// keeping relative paths. Symlinks, `.git` and build directories are never
/// visited, and a file already present in `dest` is left alone.
///
/// @param root The project root.
/// @param dest The new worktree.
/// @param patterns Globs relative to `root`; `*` does not cross a `/`.
/// @returns How many files were copied.
pub(super) fn copy_files(root: &Path, dest: &Path, patterns: &[String]) -> Result<usize> {
    let patterns = patterns
        .iter()
        .map(|p| glob::Pattern::new(p))
        .collect::<Result<Vec<_>, _>>()?;
    let options = glob::MatchOptions {
        case_sensitive: true,
        require_literal_separator: true,
        require_literal_leading_dot: false,
    };
    let dest_real = dest.canonicalize().context("resolving the worktree")?;
    let mut copied = 0;
    let mut walk = WalkDir::new(root).follow_links(false).into_iter();
    while let Some(entry) = walk.next() {
        let Ok(entry) = entry else { continue };
        let Ok(rel) = entry.path().strip_prefix(root) else {
            continue;
        };
        let name = entry.file_name().to_string_lossy();
        let skip = name == ".git"
            || (entry.file_type().is_dir()
                && (HEAVY_DIRS.contains(&name.as_ref()) || rel == Path::new(WORKTREES_REL)));
        if skip {
            if entry.file_type().is_dir() {
                walk.skip_current_dir();
            }
            continue;
        }
        if !entry.file_type().is_file() {
            continue;
        }
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        if !patterns.iter().any(|p| p.matches_with(&rel_str, options)) {
            continue;
        }
        let target = dest.join(rel);
        if target.symlink_metadata().is_ok() {
            continue;
        }
        let parent = target.parent().context("file has no parent")?;
        std::fs::create_dir_all(parent)?;
        if !parent.canonicalize()?.starts_with(&dest_real) {
            bail!("{} resolves outside the worktree", rel.display());
        }
        std::fs::copy(entry.path(), &target)
            .with_context(|| format!("copying {}", rel.display()))?;
        copied += 1;
    }
    Ok(copied)
}

async fn run_setup(command: &str, cwd: &Path, log: &Path, timeout: Duration) -> Result<()> {
    let out = std::fs::File::create(log).context("creating the setup log")?;
    let err = out.try_clone()?;
    let mut shell = tokio::process::Command::new("sh");
    shell
        .args(["-c", command])
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .stdout(out)
        .stderr(err)
        .kill_on_drop(true);
    #[cfg(unix)]
    shell.process_group(0);
    let mut child = shell.spawn().context("starting the setup command")?;
    match tokio::time::timeout(timeout, child.wait()).await {
        Ok(status) => {
            let status = status?;
            if !status.success() {
                bail!("setup `{command}` failed ({status}){}", log_tail(log));
            }
            Ok(())
        }
        Err(_) => {
            #[cfg(unix)]
            if let Some(pgid) = child.id() {
                let _ = tokio::process::Command::new("kill")
                    .args(["-KILL", "--", &format!("-{pgid}")])
                    .status()
                    .await;
            }
            let _ = child.start_kill();
            let _ = child.wait().await;
            bail!("setup `{command}` timed out after {}s", timeout.as_secs())
        }
    }
}

fn log_tail(log: &Path) -> String {
    let text = std::fs::read_to_string(log).unwrap_or_default();
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let tail = &lines[lines.len().saturating_sub(ERROR_TAIL_LINES)..];
    if tail.is_empty() {
        return String::new();
    }
    format!(": {}", tail.join(" | "))
}
