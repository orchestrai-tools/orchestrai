//! The checkouts a [`StartPoint`] produces: a new task branch forked from a
//! chosen base, or an existing branch checked out as-is. Runs off the actor
//! like every other worktree creation (ADR 0002).

use std::path::Path;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use warpforge_protocol as wire;

use super::detached::{create_detached, fork_detached, prepare_worktrees_dir};
use super::merge::run_git;
use super::Worktree;

/// Network git calls (fetch, ls-remote) give up after this long rather than
/// leaving the task waiting on a hung connection.
const NETWORK_TIMEOUT: Duration = Duration::from_secs(120);

/// Where a new task worktree starts, resolved from the wire's `WorktreeBase`
/// by [`super::resolve_start`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub enum StartPoint {
    /// A new task branch from the project checkout's current HEAD.
    #[default]
    Head,
    /// A new task branch from this local branch.
    Branch(String),
    /// A new task branch from origin's default branch, fetched first.
    Origin,
    /// An existing branch checked out into the worktree.
    Existing(ExistingBranch),
}

impl StartPoint {
    /// The fork-only subset of the wire's bases, which needs no lookup: what an
    /// automation run starts from. Anything else falls back to [`Self::Head`];
    /// automation create and update refuse those bases up front.
    pub fn fork(base: Option<&wire::WorktreeBase>) -> Self {
        match base {
            Some(wire::WorktreeBase::Branch { name }) => Self::Branch(name.clone()),
            Some(wire::WorktreeBase::Origin) => Self::Origin,
            _ => Self::Head,
        }
    }
}

/// An existing branch to check out, and where it comes from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExistingBranch {
    /// Local branch the worktree checks out.
    pub local: String,
    /// Remote branch `local` is created from, tracking it, when `local` does
    /// not exist yet.
    pub remote: Option<RemoteBranch>,
    /// Branch recorded as the task's merge target.
    pub target: String,
    /// A remote to add before fetching, as `(name, url)`: a fork's pull request.
    pub add_remote: Option<(String, String)>,
}

/// One branch on a named remote.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RemoteBranch {
    pub remote: String,
    pub branch: String,
}

/// Create the worktree for `task_id` from `start`.
pub async fn create_started(
    base_repo: &Path,
    task_id: &str,
    start: &StartPoint,
) -> Result<Worktree> {
    match start {
        StartPoint::Head => create_detached(base_repo, task_id, None).await,
        StartPoint::Branch(branch) => create_detached(base_repo, task_id, Some(branch)).await,
        StartPoint::Origin => {
            let default = origin_default_branch(base_repo).await?;
            fetch_branch(base_repo, "origin", &default).await?;
            fork_detached(base_repo, task_id, &format!("origin/{default}"), &default).await
        }
        StartPoint::Existing(existing) => checkout_existing(base_repo, task_id, existing).await,
    }
}

async fn checkout_existing(
    base_repo: &Path,
    task_id: &str,
    existing: &ExistingBranch,
) -> Result<Worktree> {
    if let Some((name, url)) = &existing.add_remote {
        if !git_ok(base_repo, &["remote", "get-url", name]).await? {
            checked(base_repo, &["remote", "add", name, url], "git remote add").await?;
        }
    }
    prepare_worktrees_dir(base_repo).await;
    let wt_dir = super::worktree_path(base_repo, task_id);
    let path = wt_dir
        .to_str()
        .context("worktree path is not valid UTF-8")?;
    let local_ref = format!("refs/heads/{}", existing.local);
    let has_local = git_ok(base_repo, &["rev-parse", "--verify", "--quiet", &local_ref]).await?;
    match &existing.remote {
        Some(remote) if !has_local => {
            let tracking = format!("{}/{}", remote.remote, remote.branch);
            // Offline is fine when the branch was fetched before; a branch that
            // was never fetched cannot be checked out at all.
            if let Err(e) = fetch_branch(base_repo, &remote.remote, &remote.branch).await {
                let known = format!("refs/remotes/{tracking}");
                if !git_ok(base_repo, &["rev-parse", "--verify", "--quiet", &known]).await? {
                    return Err(e);
                }
            }
            checked(
                base_repo,
                &[
                    "worktree",
                    "add",
                    "--track",
                    "-b",
                    &existing.local,
                    path,
                    &tracking,
                ],
                "git worktree add",
            )
            .await?;
        }
        _ => {
            checked(
                base_repo,
                &["worktree", "add", path, &existing.local],
                "git worktree add",
            )
            .await?;
        }
    }
    Ok(Worktree {
        task_id: task_id.to_string(),
        path: wt_dir,
        branch: existing.local.clone(),
        base_branch: existing.target.clone(),
    })
}

/// Origin's default branch name (`main`): the local `origin/HEAD` when the
/// clone recorded one, otherwise asked of the remote.
async fn origin_default_branch(repo: &Path) -> Result<String> {
    let local = run_git(
        repo,
        &[
            "symbolic-ref",
            "--quiet",
            "--short",
            "refs/remotes/origin/HEAD",
        ],
    )
    .await?;
    if local.status.success() {
        let name = String::from_utf8_lossy(&local.stdout).trim().to_string();
        if let Some(branch) = name.strip_prefix("origin/").filter(|b| !b.is_empty()) {
            return Ok(branch.to_string());
        }
    }
    let out = network_git(repo, &["ls-remote", "--symref", "origin", "HEAD"]).await?;
    if !out.status.success() {
        bail!("could not reach origin: {}", stderr_line(&out));
    }
    parse_symref_head(&String::from_utf8_lossy(&out.stdout))
        .context("origin did not report a default branch")
}

/// The branch in `ls-remote --symref <remote> HEAD` output
/// (`ref: refs/heads/main\tHEAD`).
pub(super) fn parse_symref_head(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let rest = line.strip_prefix("ref: refs/heads/")?;
        let (branch, name) = rest.split_once('\t')?;
        (name.trim() == "HEAD" && !branch.is_empty()).then(|| branch.to_string())
    })
}

async fn fetch_branch(repo: &Path, remote: &str, branch: &str) -> Result<()> {
    let refspec = format!("+refs/heads/{branch}:refs/remotes/{remote}/{branch}");
    let out = network_git(repo, &["fetch", "--quiet", remote, &refspec]).await?;
    if !out.status.success() {
        bail!("could not fetch {remote}/{branch}: {}", stderr_line(&out));
    }
    Ok(())
}

/// A git call that talks to a remote: never prompts for credentials nothing
/// can type, and is bounded by [`NETWORK_TIMEOUT`].
async fn network_git(repo: &Path, args: &[&str]) -> Result<std::process::Output> {
    let mut cmd = tokio::process::Command::new("git");
    cmd.args(args)
        .current_dir(repo)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C")
        .kill_on_drop(true);
    match tokio::time::timeout(NETWORK_TIMEOUT, cmd.output()).await {
        Err(_) => bail!("`git {}` timed out", args.first().copied().unwrap_or("")),
        Ok(out) => out.with_context(|| format!("failed to run git {}", args[0])),
    }
}

async fn git_ok(repo: &Path, args: &[&str]) -> Result<bool> {
    Ok(run_git(repo, args).await?.status.success())
}

async fn checked(repo: &Path, args: &[&str], what: &str) -> Result<()> {
    let out = run_git(repo, args).await?;
    if !out.status.success() {
        bail!("{what} failed: {}", stderr_line(&out));
    }
    Ok(())
}

pub(super) fn stderr_line(out: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&out.stderr);
    let line = stderr
        .lines()
        .map(|l| l.trim().trim_start_matches("fatal: "))
        .find(|l| !l.is_empty())
        .unwrap_or("");
    if line.is_empty() {
        format!("exit {}", out.status)
    } else {
        line.to_string()
    }
}
