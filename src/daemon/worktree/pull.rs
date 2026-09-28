//! Look up a GitHub pull request's head through `gh pr view`, so a task can
//! start on the branch the pull request is built from.

use std::path::Path;
use std::time::Duration;

use serde::Deserialize;

const GH_TIMEOUT: Duration = Duration::from_secs(30);

/// Where a pull request's commits live and where they merge.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PullHead {
    /// Head branch name, on origin or on the fork.
    pub branch: String,
    /// Base branch the pull request merges into.
    pub base: String,
    /// The fork the head lives on; `None` when it is a branch of origin.
    pub fork: Option<Fork>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Fork {
    pub owner: String,
    pub repo: String,
}

impl Fork {
    pub(super) fn slug(&self) -> String {
        format!("{}/{}", self.owner, self.repo)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawView {
    #[serde(default)]
    state: String,
    head_ref_name: String,
    base_ref_name: String,
    #[serde(default)]
    is_cross_repository: bool,
    #[serde(default)]
    head_repository: Option<RawName>,
    #[serde(default)]
    head_repository_owner: Option<RawLogin>,
}

#[derive(Deserialize)]
struct RawName {
    name: String,
}

#[derive(Deserialize)]
struct RawLogin {
    login: String,
}

/// Pull request `number` of the repo at `repo`, via `gh pr view`.
pub(super) async fn pull_request(repo: &Path, number: u64) -> Result<PullHead, String> {
    let n = number.to_string();
    let mut cmd = tokio::process::Command::new("gh");
    cmd.current_dir(repo)
        .args([
            "pr",
            "view",
            &n,
            "--json",
            "state,headRefName,baseRefName,isCrossRepository,headRepository,headRepositoryOwner",
        ])
        .env("GH_PAGER", "cat")
        .env("GIT_TERMINAL_PROMPT", "0")
        .kill_on_drop(true);
    let out = match tokio::time::timeout(GH_TIMEOUT, cmd.output()).await {
        Err(_) => return Err("`gh pr view` timed out".into()),
        Ok(Err(e)) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err(
                "GitHub CLI (`gh`) is not installed. Install it (`brew install gh`) and run \
                 `gh auth login`."
                    .into(),
            )
        }
        Ok(Err(e)) => return Err(format!("could not run gh: {e}")),
        Ok(Ok(out)) => out,
    };
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(format!(
            "could not look up pull request #{number}: {stderr}"
        ));
    }
    parse_view(number, &String::from_utf8_lossy(&out.stdout))
}

pub(super) fn parse_view(number: u64, json: &str) -> Result<PullHead, String> {
    let raw: RawView = serde_json::from_str(json)
        .map_err(|e| format!("unexpected `gh pr view` output for #{number}: {e}"))?;
    if raw.state.eq_ignore_ascii_case("merged") {
        return Err(format!("pull request #{number} is already merged"));
    }
    let fork = if raw.is_cross_repository {
        match (raw.head_repository_owner, raw.head_repository) {
            (Some(owner), Some(repo)) => Some(Fork {
                owner: owner.login,
                repo: repo.name,
            }),
            _ => {
                return Err(format!(
                    "the fork behind pull request #{number} no longer exists"
                ))
            }
        }
    } else {
        None
    };
    Ok(PullHead {
        branch: raw.head_ref_name,
        base: raw.base_ref_name,
        fork,
    })
}

/// `owner/repo` of a GitHub-style remote URL (scp-like, `ssh://` or `https://`).
pub(super) fn repo_slug(url: &str) -> Option<String> {
    let (_, owner, repo) = split_url(url)?;
    Some(format!("{owner}/{repo}"))
}

/// The URL of `owner/repo` on the same host and scheme as `origin`.
pub(super) fn fork_url(origin: &str, owner: &str, repo: &str) -> Option<String> {
    let (prefix, _, _) = split_url(origin)?;
    let suffix = if origin.trim_end_matches('/').ends_with(".git") {
        ".git"
    } else {
        ""
    };
    Some(format!("{prefix}{owner}/{repo}{suffix}"))
}

/// `(everything before the owner, owner, repo without .git)`.
fn split_url(url: &str) -> Option<(&str, &str, &str)> {
    let trimmed = url.trim().trim_end_matches('/');
    let base = trimmed.strip_suffix(".git").unwrap_or(trimmed);
    let mut parts = base.rsplitn(3, ['/', ':']);
    let repo = parts.next()?;
    let owner = parts.next()?;
    let rest = parts.next()?;
    if repo.is_empty() || owner.is_empty() || rest.is_empty() {
        return None;
    }
    let prefix = &base[..base.len() - repo.len() - owner.len() - 1];
    Some((prefix, owner, repo))
}
