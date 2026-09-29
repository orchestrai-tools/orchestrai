//! Asking `gh` for the pull request of a worktree's current branch.

use std::process::Stdio;
use std::time::Duration;

use anyhow::{anyhow, bail, Result};
use serde::Deserialize;
use tokio::process::Command;
use warpforge_protocol as wire;

use super::checks::{check_name, check_state, rollup};
use super::PullTarget;

const GH_TIMEOUT: Duration = Duration::from_secs(20);

/// Enough rows that an open pull request is not hidden behind older closed
/// ones reusing the same branch name.
const LIST_LIMIT: &str = "10";

const FIELDS: &str = "number,title,url,state,isDraft,statusCheckRollup,headRefOid,author,updatedAt";

/// A pull request as `gh pr list` reports it, plus the timestamp that says
/// whether its conversation needs reading again.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Listed {
    pub pull: wire::TaskPullRequest,
    /// GitHub's `updatedAt`: a comment or review moves it, a check does not.
    pub updated_at: String,
}

/// The pull request whose head is the worktree's current branch, or `None`
/// when there is none, the checkout is detached, or it sits on its base branch.
pub(super) async fn fetch(target: PullTarget) -> Result<Option<Listed>> {
    let branch = match target.head.clone() {
        Some(head) => head,
        None => match crate::daemon::diff::current_branch(&target.worktree).await {
            Some(branch) => branch,
            None => return Ok(None),
        },
    };
    if target.base_branch.as_deref() == Some(branch.as_str()) {
        return Ok(None);
    }
    let mut cmd = Command::new("gh");
    cmd.current_dir(&target.worktree)
        .args(["pr", "list", "--head", &branch, "--state", "all"])
        .args(["--limit", LIST_LIMIT, "--json", FIELDS])
        .env("GH_PAGER", "cat")
        .env("GH_PROMPT_DISABLED", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .kill_on_drop(true);
    let out = tokio::time::timeout(GH_TIMEOUT, cmd.output())
        .await
        .map_err(|_| anyhow!("`gh pr list` timed out"))??;
    if !out.status.success() {
        bail!(
            "gh pr list: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    parse_pull_list(&out.stdout)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPull {
    number: u64,
    title: String,
    url: String,
    state: String,
    #[serde(default)]
    is_draft: bool,
    #[serde(default)]
    status_check_rollup: Option<Vec<GhCheck>>,
    #[serde(default)]
    head_ref_oid: Option<String>,
    #[serde(default)]
    author: Option<GhAuthor>,
    #[serde(default)]
    updated_at: Option<String>,
}

#[derive(Deserialize)]
struct GhAuthor {
    #[serde(default)]
    login: String,
}

/// A `CheckRun` carries `status` and `conclusion`; a legacy `StatusContext`
/// carries `state` alone. Any of these may arrive as `null`.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhCheck {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    conclusion: Option<String>,
    #[serde(default)]
    state: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    workflow_name: Option<String>,
    #[serde(default)]
    context: Option<String>,
    #[serde(default)]
    details_url: Option<String>,
    #[serde(default)]
    target_url: Option<String>,
    #[serde(default)]
    description: Option<String>,
}

impl GhCheck {
    fn into_run(self) -> wire::PullCheckRun {
        let text = |field: &Option<String>| field.as_deref().unwrap_or_default().to_string();
        wire::PullCheckRun {
            name: check_name(
                &text(&self.name),
                &text(&self.workflow_name),
                &text(&self.context),
            ),
            state: check_state(
                self.status.as_deref(),
                self.conclusion.as_deref(),
                self.state.as_deref(),
            ),
            url: self
                .details_url
                .filter(|url| !url.is_empty())
                .or(self.target_url)
                .unwrap_or_default(),
            summary: text(&self.description).trim().to_string(),
        }
    }
}

/// Pick the branch's open pull request, else its most recent one. `gh` lists
/// newest first.
pub(super) fn parse_pull_list(stdout: &[u8]) -> Result<Option<Listed>> {
    let pulls: Vec<GhPull> = serde_json::from_slice(stdout)?;
    let chosen = pulls
        .iter()
        .position(|pull| pull.state == "OPEN")
        .or((!pulls.is_empty()).then_some(0));
    let Some(pull) = chosen.and_then(|index| pulls.into_iter().nth(index)) else {
        return Ok(None);
    };
    let state = match pull.state.as_str() {
        "OPEN" if pull.is_draft => wire::TaskPullState::Draft,
        "OPEN" => wire::TaskPullState::Open,
        "MERGED" => wire::TaskPullState::Merged,
        _ => wire::TaskPullState::Closed,
    };
    let runs: Vec<wire::PullCheckRun> = pull
        .status_check_rollup
        .unwrap_or_default()
        .into_iter()
        .map(GhCheck::into_run)
        .collect();
    let checks = rollup(&runs);
    let failed_checks = runs
        .into_iter()
        .filter(|run| run.state == wire::PullChecks::Failing)
        .collect();
    Ok(Some(Listed {
        pull: wire::TaskPullRequest {
            number: pull.number,
            title: pull.title,
            url: pull.url,
            state,
            checks,
            head_oid: pull.head_ref_oid.filter(|oid| !oid.is_empty()),
            author: pull
                .author
                .map(|author| author.login)
                .filter(|login| !login.is_empty()),
            failed_checks,
            open_comments: Vec::new(),
        },
        updated_at: pull.updated_at.unwrap_or_default(),
    }))
}
