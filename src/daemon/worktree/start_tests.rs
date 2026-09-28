use std::path::{Path, PathBuf};

use warpforge_protocol as wire;

use super::pull::{fork_url, parse_view, repo_slug, Fork, PullHead};
use super::resolve::pull_branch;
use super::start::parse_symref_head;
use super::*;
use crate::daemon::diff::testsupport::git;

async fn out(repo: &Path, args: &[&str]) -> String {
    let o = tokio::process::Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .await
        .unwrap();
    String::from_utf8_lossy(&o.stdout).trim().to_string()
}

async fn commit(repo: &Path, file: &str) {
    std::fs::write(repo.join(file), file).unwrap();
    git(repo, &["add", "."]).await;
    git(repo, &["commit", "-q", "-m", file]).await;
}

async fn clone(url: &Path, dir: &Path) {
    git(
        url.parent().unwrap(),
        &["clone", "-q", url.to_str().unwrap(), dir.to_str().unwrap()],
    )
    .await;
    git(dir, &["config", "user.email", "t@t"]).await;
    git(dir, &["config", "user.name", "t"]).await;
}

/// `<root>/upstream/app.git` as origin with one commit on `main`, cloned to
/// `<root>/work`. Returns the work checkout.
async fn origin_and_clone(root: &Path) -> PathBuf {
    let bare = root.join("upstream").join("app.git");
    std::fs::create_dir_all(&bare).unwrap();
    git(&bare, &["init", "-q", "--bare", "-b", "main"]).await;
    let seed = root.join("seed");
    clone(&bare, &seed).await;
    commit(&seed, "base.txt").await;
    git(&seed, &["push", "-q", "origin", "HEAD:main"]).await;
    let work = root.join("work");
    clone(&bare, &work).await;
    work
}

#[tokio::test]
async fn branch_base_forks_from_that_branch_and_records_it() {
    let tmp = tempfile::tempdir().unwrap();
    let work = origin_and_clone(tmp.path()).await;
    git(&work, &["branch", "develop"]).await;
    git(&work, &["checkout", "-q", "develop"]).await;
    commit(&work, "dev.txt").await;
    git(&work, &["checkout", "-q", "main"]).await;

    let base = wire::WorktreeBase::Branch {
        name: "develop".into(),
    };
    let start = resolve_start(&work, &base).await.unwrap();
    let wt = create_started(&work, "t_dev", &start).await.unwrap();
    assert_eq!(wt.base_branch, "develop");
    assert_eq!(
        out(&wt.path, &["rev-parse", "HEAD"]).await,
        out(&work, &["rev-parse", "develop"]).await
    );

    let missing = wire::WorktreeBase::Branch {
        name: "nope".into(),
    };
    let err = resolve_start(&work, &missing).await.unwrap_err();
    assert!(err.contains("no local branch named 'nope'"), "{err}");
}

#[tokio::test]
async fn origin_base_fetches_first_and_never_tracks_the_default_branch() {
    let tmp = tempfile::tempdir().unwrap();
    let work = origin_and_clone(tmp.path()).await;
    // Origin moves on after the clone; the task must start from the new tip.
    let seed = tmp.path().join("seed");
    commit(&seed, "later.txt").await;
    git(&seed, &["push", "-q", "origin", "HEAD:main"]).await;

    let start = resolve_start(&work, &wire::WorktreeBase::Origin)
        .await
        .unwrap();
    let wt = create_started(&work, "t_origin", &start).await.unwrap();
    assert_eq!(wt.base_branch, "main");
    assert_eq!(
        out(&wt.path, &["rev-parse", "HEAD"]).await,
        out(&seed, &["rev-parse", "HEAD"]).await
    );
    let upstream = out(
        &work,
        &[
            "for-each-ref",
            "--format=%(upstream)",
            "refs/heads/warpforge/task/t_origin",
        ],
    )
    .await;
    assert_eq!(upstream, "", "a push must not aim at origin/main");
}

#[tokio::test]
async fn existing_remote_branch_is_checked_out_and_pushes_back_to_it() {
    let tmp = tempfile::tempdir().unwrap();
    let work = origin_and_clone(tmp.path()).await;
    let seed = tmp.path().join("seed");
    git(&seed, &["checkout", "-q", "-b", "feature/x"]).await;
    commit(&seed, "feature.txt").await;
    git(&seed, &["push", "-q", "origin", "feature/x"]).await;
    git(&work, &["fetch", "-q", "origin"]).await;

    let base = wire::WorktreeBase::Existing {
        branch: "origin/feature/x".into(),
    };
    let start = resolve_start(&work, &base).await.unwrap();
    let wt = create_started(&work, "t_feat", &start).await.unwrap();
    assert_eq!(wt.branch, "feature/x");
    assert_eq!(wt.base_branch, "main");

    commit(&wt.path, "task.txt").await;
    let pushed = crate::daemon::diff::push(wt.path.to_str().unwrap(), false)
        .await
        .unwrap();
    assert_eq!(pushed.status, wire::GitOpStatus::Ok, "{}", pushed.message);
    assert_eq!(
        out(&work, &["rev-parse", "origin/feature/x"]).await,
        out(&wt.path, &["rev-parse", "HEAD"]).await
    );

    remove_detached(&work, &wt.path, &wt.branch).await.unwrap();
    assert_eq!(
        out(&work, &["branch", "--list", "feature/x"]).await,
        "feature/x",
        "removing the task keeps a branch it did not create"
    );
}

#[tokio::test]
async fn a_branch_checked_out_elsewhere_is_refused() {
    let tmp = tempfile::tempdir().unwrap();
    let work = origin_and_clone(tmp.path()).await;
    let main = wire::WorktreeBase::Existing {
        branch: "main".into(),
    };
    let err = resolve_start(&work, &main).await.unwrap_err();
    assert!(
        err.contains("'main' is already checked out in the project checkout"),
        "{err}"
    );

    git(&work, &["branch", "busy"]).await;
    let busy = wire::WorktreeBase::Existing {
        branch: "busy".into(),
    };
    let start = resolve_start(&work, &busy).await.unwrap();
    create_started(&work, "t_first", &start).await.unwrap();
    let err = resolve_start(&work, &busy).await.unwrap_err();
    assert!(err.contains("'busy' is already checked out in "), "{err}");
    assert!(err.contains("t_first"), "names the other checkout: {err}");
}

#[tokio::test]
async fn a_fork_pull_request_gets_a_remote_and_pushes_to_the_fork() {
    let tmp = tempfile::tempdir().unwrap();
    let work = origin_and_clone(tmp.path()).await;
    // The fork sits where fork_url derives it from origin's path.
    let fork = tmp.path().join("alice").join("app.git");
    std::fs::create_dir_all(&fork).unwrap();
    git(
        tmp.path(),
        &[
            "clone",
            "-q",
            "--bare",
            tmp.path().join("upstream/app.git").to_str().unwrap(),
            fork.to_str().unwrap(),
        ],
    )
    .await;
    let contributor = tmp.path().join("contributor");
    clone(&fork, &contributor).await;
    git(&contributor, &["checkout", "-q", "-b", "fix-typo"]).await;
    commit(&contributor, "typo.txt").await;
    git(&contributor, &["push", "-q", "origin", "fix-typo"]).await;

    let head = PullHead {
        branch: "fix-typo".into(),
        base: "main".into(),
        fork: Some(Fork {
            owner: "alice".into(),
            repo: "app".into(),
        }),
    };
    let existing = pull_branch(&work, 7, head).await.unwrap();
    let wt = create_started(&work, "t_pr", &StartPoint::Existing(existing))
        .await
        .unwrap();
    assert_eq!(wt.branch, "fix-typo");
    assert_eq!(
        out(&work, &["remote", "get-url", "alice"]).await,
        fork.to_str().unwrap()
    );

    commit(&wt.path, "review.txt").await;
    let pushed = crate::daemon::diff::push(wt.path.to_str().unwrap(), false)
        .await
        .unwrap();
    assert_eq!(pushed.status, wire::GitOpStatus::Ok, "{}", pushed.message);
    assert_eq!(
        out(&fork, &["rev-parse", "fix-typo"]).await,
        out(&wt.path, &["rev-parse", "HEAD"]).await
    );
}

#[test]
fn pull_request_view_parses_same_repo_fork_and_merged() {
    let same = parse_view(
        3,
        r#"{"state":"OPEN","headRefName":"feat","baseRefName":"main","isCrossRepository":false,
            "headRepository":{"name":"app"},"headRepositoryOwner":{"login":"acme"}}"#,
    )
    .unwrap();
    assert_eq!(same.branch, "feat");
    assert_eq!(same.fork, None);

    let fork = parse_view(
        4,
        r#"{"state":"OPEN","headRefName":"fix","baseRefName":"dev","isCrossRepository":true,
            "headRepository":{"name":"app"},"headRepositoryOwner":{"login":"alice"}}"#,
    )
    .unwrap();
    assert_eq!(fork.base, "dev");
    assert_eq!(fork.fork.unwrap().slug(), "alice/app");

    let merged = parse_view(
        5,
        r#"{"state":"MERGED","headRefName":"x","baseRefName":"main"}"#,
    )
    .unwrap_err();
    assert!(merged.contains("already merged"), "{merged}");
}

#[test]
fn fork_urls_follow_origins_scheme() {
    assert_eq!(
        fork_url("git@github.com:acme/app.git", "alice", "app").as_deref(),
        Some("git@github.com:alice/app.git")
    );
    assert_eq!(
        fork_url("https://github.com/acme/app", "alice", "app2").as_deref(),
        Some("https://github.com/alice/app2")
    );
    assert_eq!(
        repo_slug("ssh://git@github.com/Alice/App.git").as_deref(),
        Some("Alice/App")
    );
    assert_eq!(
        parse_symref_head("ref: refs/heads/trunk\tHEAD\nabc123\tHEAD\n").as_deref(),
        Some("trunk")
    );
}
