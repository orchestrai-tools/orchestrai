use super::super::testsupport::{git, init_repo};
use super::*;

#[tokio::test]
async fn diff_parses_and_reject_reverts() {
    let dir = std::env::temp_dir().join(format!("wf-diff-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let repo = dir.to_str().unwrap();

    git(&dir, &["init", "-q"]).await;
    git(&dir, &["config", "user.email", "t@t"]).await;
    git(&dir, &["config", "user.name", "t"]).await;
    std::fs::write(dir.join("a.txt"), "one\ntwo\nthree\n").unwrap();
    git(&dir, &["add", "."]).await;
    git(&dir, &["commit", "-q", "-m", "init"]).await;

    // Modify a tracked line.
    std::fs::write(dir.join("a.txt"), "one\nTWO\nthree\n").unwrap();

    let files = working_diff(repo).await.unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, "a.txt");
    assert_eq!(files[0].status, wire::FileDiffStatus::Modified);
    assert_eq!(files[0].hunks.len(), 1);
    let body = files[0].hunks[0].lines.join("\n");
    assert!(body.contains("-two"), "hunk shows removal: {body}");
    assert!(body.contains("+TWO"), "hunk shows addition: {body}");

    // Reject the hunk -> file returns to its committed content.
    reject_hunk(repo, "a.txt", 0).await.unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.join("a.txt")).unwrap(),
        "one\ntwo\nthree\n"
    );
    assert!(
        working_diff(repo).await.unwrap().is_empty(),
        "no changes after reject"
    );

    std::fs::remove_dir_all(&dir).ok();
}

/// An empty message on amend must keep the message being rewritten. Git
/// refuses `-m ""`, so this used to abort the commit outright.
#[tokio::test]
async fn amend_without_a_message_keeps_the_previous_one() {
    let dir = std::env::temp_dir().join(format!("wf-amend-{}", uuid::Uuid::new_v4()));
    init_repo(&dir).await;
    let repo = dir.to_str().unwrap();
    std::fs::write(dir.join("a.txt"), "one\n").unwrap();
    commit(repo, "feat: first\n\nwith a body", None, false)
        .await
        .unwrap();

    std::fs::write(dir.join("b.txt"), "two\n").unwrap();
    commit(repo, "", None, true).await.unwrap();

    assert_eq!(
        last_commit_message(repo).await.unwrap(),
        "feat: first\n\nwith a body"
    );
    let log = Command::new("git")
        .args(["-C", repo, "log", "--oneline"])
        .output()
        .await
        .unwrap();
    assert_eq!(
        String::from_utf8_lossy(&log.stdout).lines().count(),
        1,
        "amend rewrites rather than adds"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn stage_paths_moves_untracked_into_the_index() {
    let dir = std::env::temp_dir().join(format!("wf-stage-{}", uuid::Uuid::new_v4()));
    init_repo(&dir).await;
    let repo = dir.to_str().unwrap();
    std::fs::write(dir.join("keep.txt"), "one\n").unwrap();
    git(&dir, &["add", "."]).await;
    git(&dir, &["commit", "-q", "-m", "init"]).await;

    std::fs::write(dir.join("new.txt"), "brand new\n").unwrap();
    stage_paths(repo, &["new.txt".to_string()]).await.unwrap();

    // Staged = in the index, no longer untracked.
    let staged = Command::new("git")
        .args(["-C", repo, "diff", "--cached", "--name-only"])
        .output()
        .await
        .unwrap();
    assert_eq!(String::from_utf8_lossy(&staged.stdout).trim(), "new.txt");
    let untracked = super::super::working::untracked_diff(repo).await.unwrap();
    assert!(
        untracked.iter().all(|f| f.path != "new.txt"),
        "staged file leaves Unversioned"
    );

    std::fs::remove_dir_all(&dir).ok();
}

#[tokio::test]
async fn stage_paths_refuses_escapes_and_empty_lists() {
    let dir = std::env::temp_dir().join(format!("wf-stage-neg-{}", uuid::Uuid::new_v4()));
    init_repo(&dir).await;
    let repo = dir.to_str().unwrap();

    assert!(stage_paths(repo, &[]).await.is_err());
    assert!(stage_paths(repo, &["../evil.txt".to_string()])
        .await
        .is_err());

    std::fs::remove_dir_all(&dir).ok();
}
