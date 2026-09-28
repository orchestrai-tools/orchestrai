//! Asking `gh` for the pull request of a worktree's current branch.

use std::process::Stdio;
use std::time::Duration;

use anyhow::{anyhow, bail, Result};
use serde::Deserialize;
use tokio::process::Command;
use warpforge_protocol as wire;

use super::PullTarget;

const GH_TIMEOUT: Duration = Duration::from_secs(20);

/// Enough rows that an open pull request is not hidden behind older closed
/// ones reusing the same branch name.
const LIST_LIMIT: &str = "10";

const FIELDS: &str = "number,title,url,state,isDraft,statusCheckRollup,headRefOid";

/// The pull request whose head is the worktree's current branch, or `None`
/// when there is none, the checkout is detached, or it sits on its base branch.
pub(super) async fn fetch(target: PullTarget) -> Result<Option<wire::TaskPullRequest>> {
    let Some(branch) = crate::daemon::diff::current_branch(&target.worktree).await else {
        return Ok(None);
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
}

/// A `CheckRun` carries `status` and `conclusion`; a legacy `StatusContext`
/// carries `state` alone.
#[derive(Deserialize)]
struct GhCheck {
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    conclusion: Option<String>,
    #[serde(default)]
    state: Option<String>,
}

/// Pick the branch's open pull request, else its most recent one. `gh` lists
/// newest first.
pub(super) fn parse_pull_list(stdout: &[u8]) -> Result<Option<wire::TaskPullRequest>> {
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
    Ok(Some(wire::TaskPullRequest {
        number: pull.number,
        title: pull.title,
        url: pull.url,
        state,
        checks: summarize_checks(pull.status_check_rollup.as_deref().unwrap_or_default()),
        head_oid: pull.head_ref_oid.filter(|oid| !oid.is_empty()),
    }))
}

fn summarize_checks(checks: &[GhCheck]) -> Option<wire::PullChecks> {
    if checks.is_empty() {
        return None;
    }
    let mut pending = false;
    for check in checks {
        if let Some(state) = check.state.as_deref() {
            match state {
                "FAILURE" | "ERROR" => return Some(wire::PullChecks::Failing),
                "PENDING" | "EXPECTED" => pending = true,
                _ => {}
            }
            continue;
        }
        if matches!(
            check.conclusion.as_deref(),
            Some("FAILURE" | "TIMED_OUT" | "CANCELLED" | "ACTION_REQUIRED" | "STARTUP_FAILURE")
        ) {
            return Some(wire::PullChecks::Failing);
        }
        if check.status.as_deref().is_some_and(|s| s != "COMPLETED") {
            pending = true;
        }
    }
    Some(if pending {
        wire::PullChecks::Pending
    } else {
        wire::PullChecks::Passing
    })
}
