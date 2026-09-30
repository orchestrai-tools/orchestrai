//! The git half of a checkout-mode run, always off the actor loop (ADR 0002):
//! inspecting the project checkout, switching it to the task branch, and
//! giving it back. Nothing here stashes, resets or discards: a checkout with
//! uncommitted work is refused or left as it is.

use std::path::Path;

use tokio::process::Command as Process;

use warpforge_protocol as wire;

use crate::daemon::worktree::owns_branch;

/// Where the project checkout was before the Factory switched it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReturnPoint {
    /// The branch it was on; `None` for a detached HEAD.
    pub branch: Option<String>,
    pub commit: String,
}

/// How giving the project checkout back ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum GiveBack {
    /// Switched back to where it was.
    Returned,
    /// It was no longer on the task branch, so there was nothing to undo.
    Released,
    /// Switching back would lose work or failed; says what to do.
    Held(String),
}

async fn git(repo: &Path, args: &[&str]) -> Result<String, String> {
    let out = Process::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .env("LC_ALL", "C")
        .output()
        .await
        .map_err(|e| format!("could not run git: {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let line = stderr
            .lines()
            .map(|l| {
                l.trim()
                    .trim_start_matches("fatal: ")
                    .trim_start_matches("error: ")
            })
            .find(|l| !l.is_empty())
            .unwrap_or("git failed")
            .to_string();
        Err(line)
    }
}

async fn current_branch(repo: &Path) -> Option<String> {
    git(repo, &["symbolic-ref", "--quiet", "--short", "HEAD"])
        .await
        .ok()
        .filter(|b| !b.is_empty())
}

/// Why the checkout's working tree cannot be switched now, if it cannot.
enum Busy {
    /// Tracked edits or untracked files: they would follow the switch, and
    /// delivery would commit them.
    Changes,
    Operation(&'static str),
}

async fn busy(repo: &Path) -> Result<Option<Busy>, String> {
    for (marker, what) in [
        ("MERGE_HEAD", "a merge"),
        ("rebase-merge", "a rebase"),
        ("rebase-apply", "a rebase"),
        ("CHERRY_PICK_HEAD", "a cherry-pick"),
        ("REVERT_HEAD", "a revert"),
        ("BISECT_LOG", "a bisect"),
    ] {
        let path = git(repo, &["rev-parse", "--git-path", marker]).await?;
        if repo.join(&path).exists() || Path::new(&path).exists() {
            return Ok(Some(Busy::Operation(what)));
        }
    }
    let status = git(repo, &["status", "--porcelain", "--untracked-files=normal"]).await?;
    Ok((!status.is_empty()).then_some(Busy::Changes))
}

fn refused(cause: wire::CheckoutBusyCause, detail: impl Into<String>) -> wire::RunnerWait {
    wire::RunnerWait::CheckoutBusy {
        cause,
        detail: Some(detail.into()),
    }
}

/// Whether the project checkout can host a run, and where it is now.
/// @param repo the project checkout
/// @returns where to return it, or why it cannot be used
pub async fn inspect(repo: &Path) -> Result<ReturnPoint, wire::RunnerWait> {
    use wire::CheckoutBusyCause as Cause;
    match busy(repo).await.map_err(|e| refused(Cause::Other, e))? {
        Some(Busy::Changes) => {
            return Err(refused(
                Cause::Dirty,
                "the project folder has uncommitted changes or untracked files",
            ))
        }
        Some(Busy::Operation(what)) => {
            return Err(refused(
                Cause::Operation,
                format!("{what} is in progress in the project folder"),
            ))
        }
        None => {}
    }
    let commit = git(repo, &["rev-parse", "HEAD"])
        .await
        .map_err(|_| refused(Cause::Other, "the project folder has no commit yet"))?;
    Ok(ReturnPoint {
        branch: current_branch(repo).await,
        commit,
    })
}

/// Fetch origin's default branch and switch the checkout to a new task
/// branch from it, only while the checkout is still clean and where
/// [`inspect`] saw it.
/// @param repo the project checkout
/// @param branch the task branch to create
/// @param expected where the checkout was when it was inspected
/// @returns origin's default branch name, or why the checkout was left alone
pub async fn switch_to_task(
    repo: &Path,
    branch: &str,
    expected: &ReturnPoint,
) -> Result<String, wire::RunnerWait> {
    use wire::CheckoutBusyCause as Cause;
    let now = inspect(repo).await?;
    if &now != expected {
        return Err(refused(
            Cause::Other,
            "the project folder moved while the Factory prepared it",
        ));
    }
    let default = crate::daemon::worktree::fetch_origin_default(repo)
        .await
        .map_err(|e| refused(Cause::Other, format!("{e:#}")))?;
    git(
        repo,
        &[
            "switch",
            "--quiet",
            "--no-track",
            "-c",
            branch,
            &format!("origin/{default}"),
        ],
    )
    .await
    .map_err(|e| {
        refused(
            Cause::Other,
            format!("could not switch the project folder to {branch}: {e}"),
        )
    })?;
    Ok(default)
}

/// Switch the checkout back to where it was, only from the task branch and
/// only with a clean working tree. A task branch without commits of its own
/// is deleted; one with commits is kept.
/// @param repo the project checkout
/// @param branch the task branch
/// @param back where the checkout was before, when known
/// @param base origin's default branch the task branch started from
/// @returns what happened
pub async fn give_back(
    repo: &Path,
    branch: &str,
    back: Option<&ReturnPoint>,
    base: Option<&str>,
) -> GiveBack {
    if current_branch(repo).await.as_deref() != Some(branch) {
        return GiveBack::Released;
    }
    let held = |cause: String| {
        GiveBack::Held(format!(
            "The Factory left your project folder on {branch} because {cause}, then choose Try \
             again."
        ))
    };
    match busy(repo).await {
        Ok(None) => {}
        Ok(Some(Busy::Changes)) => {
            return held("it has uncommitted changes — commit, stash or discard them".to_string())
        }
        Ok(Some(Busy::Operation(what))) => {
            return held(format!("{what} is in progress — finish or abort it"))
        }
        Err(error) => return held(format!("git could not read it ({error}) — check it")),
    }
    let Some(back) = back else {
        return held("the branch it was on before is not known — switch back yourself".into());
    };
    let switched = match &back.branch {
        Some(name) => git(repo, &["switch", "--quiet", name]).await,
        None => git(repo, &["switch", "--quiet", "--detach", &back.commit]).await,
    };
    if let Err(error) = switched {
        return held(format!(
            "switching back failed ({error}) — switch back yourself"
        ));
    }
    if let Some(base) = base.filter(|_| owns_branch(branch)) {
        let range = format!("origin/{base}..{branch}");
        if git(repo, &["rev-list", "--count", &range]).await.as_deref() == Ok("0") {
            let _ = git(repo, &["branch", "-D", branch]).await;
        }
    }
    GiveBack::Returned
}
