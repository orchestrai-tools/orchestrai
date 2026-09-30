//! The off-loop half of ending an attempt: what the stage agents cost, and
//! for a successful pipeline the commit, push and draft pull request. Runs on
//! a spawned task; only its result crosses back to the actor (ADR 0002).

use std::future::Future;
use std::pin::Pin;
use std::sync::{Arc, Mutex};

use anyhow::Result;
use tokio::process::Command as Process;
use tokio::sync::mpsc;

use warpforge_protocol as wire;

use super::RunnerCommand;
use crate::daemon::actor::Command;
use crate::daemon::diff;
use crate::daemon::store::Store;
use crate::daemon::worktree::owns_branch;

type PrFuture = Pin<Box<dyn Future<Output = Result<String>> + Send>>;
/// Opens a draft pull request: `(worktree, title, body, base)` to its URL.
pub(crate) type PrOpener =
    Arc<dyn Fn(String, String, String, Option<String>) -> PrFuture + Send + Sync>;

fn gh_opener() -> PrOpener {
    Arc::new(|repo, title, body, base| {
        Box::pin(async move { diff::create_draft_pr(&repo, &title, &body, base.as_deref()).await })
    })
}

/// `gh pr create --draft` in production; test daemons never run `gh`.
pub(super) fn default_opener() -> PrOpener {
    #[cfg(not(test))]
    return gh_opener();
    #[cfg(test)]
    Arc::new(|_, _, _, _| Box::pin(async { anyhow::bail!("tests never run gh") }))
}

/// Everything delivery needs, read on the loop before it is spawned.
#[derive(Debug, Clone)]
pub(crate) struct DeliveryJob {
    /// The project root, whose `worktree.copy` files are never committed.
    pub project_path: String,
    pub worktree: String,
    /// The local name of the branch the task forked from.
    pub base: Option<String>,
    pub title: String,
    pub message: String,
    pub body: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Delivery {
    Opened { url: String, number: Option<u64> },
    NoChanges,
    Failed(String),
}

pub(super) struct Wrapup {
    pub task_id: String,
    pub run_id: String,
    pub children: Vec<String>,
    pub job: Option<DeliveryJob>,
    pub persist: crate::daemon::runtime::Persist,
    pub store: Option<Arc<Mutex<Store>>>,
    pub open_pr: PrOpener,
    pub cmd_tx: mpsc::Sender<Command>,
}

pub(super) fn spawn(wrapup: Wrapup) {
    tokio::spawn(async move {
        wrapup.persist.flush().await;
        let children = wrapup.children;
        let cost_usd = crate::daemon::runtime::store_read(wrapup.store, move |store| {
            cost_of(store, &children)
        })
        .await
        .flatten();
        let delivery = match wrapup.job {
            Some(job) => Some(deliver(job, wrapup.open_pr).await),
            None => None,
        };
        let _ = wrapup
            .cmd_tx
            .send(Command::Runner(RunnerCommand::Finished {
                task_id: wrapup.task_id,
                run_id: wrapup.run_id,
                cost_usd,
                delivery,
            }))
            .await;
    });
}

/// USD the stage sessions reported, summed per session as running totals.
fn cost_of(store: &Store, children: &[String]) -> Option<f64> {
    let per_child: Vec<f64> = children
        .iter()
        .filter_map(|child| {
            let samples: Vec<f64> = store
                .load_session_updates(child)
                .ok()?
                .into_iter()
                .filter_map(|update| match update {
                    wire::SessionUpdate::Usage {
                        cost: Some(cost), ..
                    } if cost.currency == "USD" => Some(cost.amount),
                    _ => None,
                })
                .collect();
            crate::daemon::spend::sum_runs(&samples)
        })
        .collect();
    (!per_child.is_empty()).then(|| per_child.iter().sum())
}

async fn git_stdout(repo: &str, args: &[&str]) -> Option<String> {
    let out = Process::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .await
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Untracked files in the worktree that the project's `worktree.copy` put
/// there, such as `.env`: local files, never part of the change.
async fn copied_files(job: &DeliveryJob) -> Vec<String> {
    let root = std::path::Path::new(&job.project_path);
    let patterns: Vec<glob::Pattern> = crate::config::try_load_workspace_config(root)
        .ok()
        .flatten()
        .and_then(|config| config.worktree)
        .map(|worktree| worktree.copy)
        .unwrap_or_default()
        .iter()
        .filter_map(|p| glob::Pattern::new(p).ok())
        .collect();
    if patterns.is_empty() {
        return Vec::new();
    }
    let options = glob::MatchOptions {
        case_sensitive: true,
        require_literal_separator: true,
        require_literal_leading_dot: false,
    };
    let untracked = git_stdout(
        &job.worktree,
        &["ls-files", "--others", "--exclude-standard", "-z"],
    )
    .await
    .unwrap_or_default();
    untracked
        .split('\0')
        .filter(|path| !path.is_empty())
        .filter(|path| patterns.iter().any(|p| p.matches_with(path, options)))
        .map(str::to_string)
        .collect()
}

/// Stage the worktree's change without the copied local files.
/// @returns the staged paths
async fn stage_change(job: &DeliveryJob) -> Result<Vec<String>, String> {
    let copied = copied_files(job).await;
    git_stdout(&job.worktree, &["add", "-A"])
        .await
        .ok_or_else(|| "git add failed in the task checkout".to_string())?;
    if !copied.is_empty() {
        let mut args = vec!["reset", "-q", "--"];
        args.extend(copied.iter().map(String::as_str));
        git_stdout(&job.worktree, &args)
            .await
            .ok_or_else(|| "could not leave copied files out of the commit".to_string())?;
    }
    let staged = git_stdout(&job.worktree, &["diff", "--cached", "--name-only", "-z"])
        .await
        .ok_or_else(|| "git diff failed in the task checkout".to_string())?;
    Ok(staged
        .split('\0')
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .collect())
}

/// The pull request number at the end of a GitHub pull request URL.
fn pr_number(url: &str) -> Option<u64> {
    url.trim_end_matches('/')
        .rsplit_once("/pull/")?
        .1
        .parse()
        .ok()
}

/// Commit the worktree's change on its task branch, push it and open a draft
/// pull request. Refuses a branch the runner did not create.
/// @param job the worktree and texts, read on the loop
/// @param open_pr how the pull request is opened
/// @returns what happened; nothing is retried
pub(crate) async fn deliver(job: DeliveryJob, open_pr: PrOpener) -> Delivery {
    let Some(branch) = diff::current_branch(&job.worktree).await else {
        return Delivery::Failed("the task checkout is not on a branch".to_string());
    };
    if !owns_branch(&branch) {
        return Delivery::Failed(format!("`{branch}` is not a branch the Factory created"));
    }
    let staged = match stage_change(&job).await {
        Ok(staged) => staged,
        Err(reason) => return Delivery::Failed(reason),
    };
    let ahead = match job.base.as_deref() {
        Some(base) => git_stdout(
            &job.worktree,
            &["rev-list", "--count", &format!("origin/{base}..HEAD")],
        )
        .await
        .and_then(|n| n.parse::<u64>().ok())
        .unwrap_or(0),
        None => 0,
    };
    if staged.is_empty() && ahead == 0 {
        return Delivery::NoChanges;
    }
    if !staged.is_empty() {
        if let Err(error) = diff::commit(&job.worktree, &job.message, Some(&staged), false).await {
            return Delivery::Failed(format!("{error:#}"));
        }
    }
    match diff::push(&job.worktree, false).await {
        Ok(result)
            if matches!(
                result.status,
                wire::GitOpStatus::Ok | wire::GitOpStatus::UpToDate
            ) => {}
        Ok(result) => return Delivery::Failed(result.message),
        Err(error) => return Delivery::Failed(format!("{error:#}")),
    }
    match open_pr(job.worktree, job.title, job.body, job.base).await {
        Ok(url) if !url.is_empty() => Delivery::Opened {
            number: pr_number(&url),
            url,
        },
        Ok(_) => Delivery::Failed("gh did not report the pull request's address".to_string()),
        Err(error) => Delivery::Failed(format!("{error:#}")),
    }
}

/// A stand-in item for an entry whose backlog item can no longer be read.
pub(super) fn item_from_entry(entry: &wire::RunnerEntry) -> wire::BacklogItem {
    wire::BacklogItem {
        id: entry.item_id.clone().unwrap_or_default(),
        number: entry.number,
        project: entry.project.clone(),
        title: entry.title.clone(),
        body: String::new(),
        status: "in_progress".to_string(),
        priority: entry.priority.clone(),
        source: "local".to_string(),
        external_id: None,
        url: None,
        remote_status: None,
        assignee: None,
        created_at: 0,
        updated_at: 0,
        task_id: Some(entry.task_id.clone()),
    }
}
