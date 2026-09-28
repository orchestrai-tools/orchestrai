//! Turn the wire's `WorktreeBase` into a [`StartPoint`] before the task is
//! created, so a bad choice is refused with a message instead of producing a
//! blocked task. Only local git reads, except a pull request's lookup.

use std::path::Path;

use warpforge_protocol as wire;

use super::discover::parse_worktree_list;
use super::merge::run_git;
use super::pull::{pull_request, PullHead};
use super::{ExistingBranch, RemoteBranch, StartPoint};

/// Resolve `base` against the project repo at `base_repo`. An existing branch
/// already checked out in the project checkout or another worktree is refused:
/// git allows a branch in one checkout at a time.
pub async fn resolve_start(
    base_repo: &Path,
    base: &wire::WorktreeBase,
) -> Result<StartPoint, String> {
    match base {
        wire::WorktreeBase::Branch { name } => {
            if !has_ref(base_repo, &format!("refs/heads/{name}")).await? {
                return Err(format!("there is no local branch named '{name}'"));
            }
            Ok(StartPoint::Branch(name.clone()))
        }
        wire::WorktreeBase::Origin => {
            if !git_ok(base_repo, &["remote", "get-url", "origin"]).await? {
                return Err("this project has no 'origin' remote to start from".into());
            }
            Ok(StartPoint::Origin)
        }
        wire::WorktreeBase::Existing { branch } => {
            let existing = existing_branch(base_repo, branch).await?;
            refuse_checked_out(base_repo, &existing.local).await?;
            Ok(StartPoint::Existing(existing))
        }
        wire::WorktreeBase::PullRequest { number } => {
            let head = pull_request(base_repo, *number).await?;
            let existing = pull_branch(base_repo, *number, head).await?;
            refuse_checked_out(base_repo, &existing.local).await?;
            Ok(StartPoint::Existing(existing))
        }
    }
}

/// `name` as a local branch, or as `<remote>/<branch>` to create locally.
async fn existing_branch(repo: &Path, name: &str) -> Result<ExistingBranch, String> {
    let target = merge_target(repo).await?;
    if has_ref(repo, &format!("refs/heads/{name}")).await? {
        return Ok(ExistingBranch {
            local: name.to_string(),
            remote: None,
            target,
            add_remote: None,
        });
    }
    if has_ref(repo, &format!("refs/remotes/{name}")).await? {
        for remote in remotes(repo).await? {
            let Some(branch) = name.strip_prefix(&format!("{remote}/")) else {
                continue;
            };
            let exists_locally = has_ref(repo, &format!("refs/heads/{branch}")).await?;
            return Ok(ExistingBranch {
                local: branch.to_string(),
                remote: (!exists_locally).then(|| RemoteBranch {
                    remote,
                    branch: branch.to_string(),
                }),
                target,
                add_remote: None,
            });
        }
    }
    Err(format!("there is no branch named '{name}'"))
}

/// The pull request's head as a branch to check out. A fork's head is fetched
/// through a remote for that fork, reused when one already points at it.
pub(super) async fn pull_branch(
    repo: &Path,
    number: u64,
    head: PullHead,
) -> Result<ExistingBranch, String> {
    let local_exists = has_ref(repo, &format!("refs/heads/{}", head.branch)).await?;
    let Some(fork) = head.fork else {
        return Ok(ExistingBranch {
            local: head.branch.clone(),
            remote: (!local_exists).then(|| RemoteBranch {
                remote: "origin".into(),
                branch: head.branch.clone(),
            }),
            target: head.base,
            add_remote: None,
        });
    };
    let mut add_remote = None;
    let mut remote_name = None;
    for remote in remotes(repo).await? {
        let url = remote_url(repo, &remote).await?;
        if super::pull::repo_slug(&url).is_some_and(|slug| slug.eq_ignore_ascii_case(&fork.slug()))
        {
            remote_name = Some(remote);
            break;
        }
    }
    let remote = match remote_name {
        Some(remote) => remote,
        None => {
            let name = fork.owner.clone();
            if remotes(repo).await?.contains(&name) {
                return Err(format!(
                    "a remote named '{name}' already exists but does not point at {}",
                    fork.slug()
                ));
            }
            let origin = remote_url(repo, "origin").await?;
            let url = super::pull::fork_url(&origin, &fork.owner, &fork.repo)
                .ok_or_else(|| format!("cannot derive the fork's URL from origin ({origin})"))?;
            add_remote = Some((name.clone(), url));
            name
        }
    };
    if local_exists {
        let upstream = upstream_of(repo, &head.branch).await?;
        let expected = format!("{remote}/{}", head.branch);
        if upstream.as_deref() != Some(expected.as_str()) {
            return Err(format!(
                "a local branch '{}' already exists and is not pull request #{number}'s branch; \
                 rename or delete it first",
                head.branch
            ));
        }
    }
    Ok(ExistingBranch {
        local: head.branch.clone(),
        remote: (!local_exists).then(|| RemoteBranch {
            remote,
            branch: head.branch.clone(),
        }),
        target: head.base,
        add_remote,
    })
}

async fn refuse_checked_out(repo: &Path, branch: &str) -> Result<(), String> {
    let out = run_git(repo, &["worktree", "list", "--porcelain"])
        .await
        .map_err(|e| format!("{e:#}"))?;
    if !out.status.success() {
        return Err(format!(
            "could not list worktrees: {}",
            super::start::stderr_line(&out)
        ));
    }
    let listed = parse_worktree_list(&String::from_utf8_lossy(&out.stdout));
    let Some(holder) = listed.iter().find(|w| w.branch.as_deref() == Some(branch)) else {
        return Ok(());
    };
    let root = listed.first().map(|w| w.path.as_path());
    let place = if root == Some(holder.path.as_path()) {
        "the project checkout".to_string()
    } else {
        holder.path.display().to_string()
    };
    Err(format!(
        "'{branch}' is already checked out in {place}. Switch that checkout to another branch \
         or finish the task using it, then try again."
    ))
}

/// The root checkout's current branch: what a checked-out existing branch
/// merges back into, as for a task forked from HEAD.
async fn merge_target(repo: &Path) -> Result<String, String> {
    let out = git(repo, &["rev-parse", "--abbrev-ref", "HEAD"]).await?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

async fn upstream_of(repo: &Path, branch: &str) -> Result<Option<String>, String> {
    let out = git(
        repo,
        &[
            "for-each-ref",
            "--format=%(upstream:short)",
            &format!("refs/heads/{branch}"),
        ],
    )
    .await?;
    let upstream = String::from_utf8_lossy(&out.stdout).trim().to_string();
    Ok((!upstream.is_empty()).then_some(upstream))
}

async fn remotes(repo: &Path) -> Result<Vec<String>, String> {
    let out = git(repo, &["remote"]).await?;
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .map(str::to_string)
        .collect())
}

async fn remote_url(repo: &Path, remote: &str) -> Result<String, String> {
    let out = git(repo, &["remote", "get-url", remote]).await?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

async fn has_ref(repo: &Path, refname: &str) -> Result<bool, String> {
    git_ok(repo, &["rev-parse", "--verify", "--quiet", refname]).await
}

async fn git_ok(repo: &Path, args: &[&str]) -> Result<bool, String> {
    run_git(repo, args)
        .await
        .map(|out| out.status.success())
        .map_err(|e| format!("{e:#}"))
}

async fn git(repo: &Path, args: &[&str]) -> Result<std::process::Output, String> {
    run_git(repo, args).await.map_err(|e| format!("{e:#}"))
}
