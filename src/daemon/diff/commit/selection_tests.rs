use super::*;
use crate::daemon::diff::testsupport::{git, init_repo};

async fn fixture() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    init_repo(dir.path()).await;
    std::fs::write(dir.path().join("selected.txt"), "selected base\n").unwrap();
    std::fs::write(dir.path().join("unselected.txt"), "unselected base\n").unwrap();
    commit(dir.path().to_str().unwrap(), "baseline", None, false)
        .await
        .unwrap();
    dir
}

async fn output(repo: &str, args: &[&str]) -> String {
    let out = git_command(repo).args(args).output().await.unwrap();
    assert!(
        out.status.success(),
        "{}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap().trim().to_string()
}

#[tokio::test]
async fn selected_commit_keeps_unselected_staged_and_unstaged_edits_out() {
    let dir = fixture().await;
    let repo = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("selected.txt"), "selected edit\n").unwrap();
    std::fs::write(dir.path().join("unselected.txt"), "staged edit\n").unwrap();
    git(dir.path(), &["add", "unselected.txt"]).await;
    std::fs::write(dir.path().join("unselected.txt"), "later unstaged edit\n").unwrap();

    commit(repo, "selected only", Some(&["selected.txt".into()]), false)
        .await
        .unwrap();

    assert_eq!(
        output(repo, &["show", "HEAD:unselected.txt"]).await,
        "unselected base"
    );
    assert_eq!(
        output(repo, &["show", ":unselected.txt"]).await,
        "staged edit"
    );
    assert_eq!(
        output(repo, &["diff", "--cached", "--name-only"]).await,
        "unselected.txt"
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("unselected.txt")).unwrap(),
        "later unstaged edit\n"
    );
    assert_eq!(
        output(
            repo,
            &["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]
        )
        .await,
        "selected.txt"
    );
}

#[tokio::test]
async fn empty_selection_is_refused_before_changing_the_index_or_head() {
    let dir = fixture().await;
    let repo = dir.path().to_str().unwrap();
    let head = output(repo, &["rev-parse", "HEAD"]).await;
    std::fs::write(dir.path().join("selected.txt"), "not selected\n").unwrap();
    assert!(commit(repo, "nothing", Some(&[]), false).await.is_err());
    assert!(commit(repo, "", Some(&[]), true).await.is_err());
    assert_eq!(output(repo, &["rev-parse", "HEAD"]).await, head);
    assert!(output(repo, &["diff", "--cached", "--name-only"])
        .await
        .is_empty());
}

#[tokio::test]
async fn a_first_commit_can_select_one_new_file_without_taking_other_staged_files() {
    let dir = tempfile::tempdir().unwrap();
    init_repo(dir.path()).await;
    let repo = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("selected.txt"), "first\n").unwrap();
    std::fs::write(dir.path().join("unselected.txt"), "later\n").unwrap();
    git(dir.path(), &["add", "unselected.txt"]).await;
    commit(
        repo,
        "first selected",
        Some(&["selected.txt".into()]),
        false,
    )
    .await
    .unwrap();
    assert_eq!(
        output(repo, &["ls-tree", "--name-only", "HEAD"]).await,
        "selected.txt"
    );
    assert_eq!(
        output(repo, &["diff", "--cached", "--name-only"]).await,
        "unselected.txt"
    );
}

#[tokio::test]
async fn selecting_an_unstaged_deletion_removes_it_from_head() {
    let dir = fixture().await;
    let repo = dir.path().to_str().unwrap();
    std::fs::remove_file(dir.path().join("selected.txt")).unwrap();
    commit(
        repo,
        "remove selected",
        Some(&["selected.txt".into()]),
        false,
    )
    .await
    .unwrap();
    assert_eq!(
        output(repo, &["ls-tree", "--name-only", "HEAD"]).await,
        "unselected.txt"
    );
    assert!(output(repo, &["diff", "--cached", "--name-only"])
        .await
        .is_empty());
}

#[tokio::test]
async fn selection_treats_wildcards_as_literal_filenames() {
    let dir = fixture().await;
    let repo = dir.path().to_str().unwrap();
    for path in ["a[1].txt", "a1.txt", "notes..txt"] {
        std::fs::write(dir.path().join(path), "base\n").unwrap();
    }
    commit(repo, "filenames", None, false).await.unwrap();
    for path in ["a[1].txt", "a1.txt", "notes..txt"] {
        std::fs::write(dir.path().join(path), "edited\n").unwrap();
    }
    commit(
        repo,
        "literal filenames",
        Some(&["a[1].txt".into(), "notes..txt".into()]),
        false,
    )
    .await
    .unwrap();
    assert_eq!(output(repo, &["show", "HEAD:a1.txt"]).await, "base");
    assert_eq!(output(repo, &["show", "HEAD:a[1].txt"]).await, "edited");
    assert_eq!(output(repo, &["show", "HEAD:notes..txt"]).await, "edited");
}

#[tokio::test]
async fn selected_addition_and_deletion_preserve_an_unrelated_staged_file() {
    let dir = fixture().await;
    let repo = dir.path().to_str().unwrap();
    git(dir.path(), &["rm", "selected.txt"]).await;
    std::fs::write(dir.path().join("new.txt"), "new\n").unwrap();
    std::fs::write(dir.path().join("unselected.txt"), "staged\n").unwrap();
    git(dir.path(), &["add", "unselected.txt"]).await;
    commit(
        repo,
        "add and delete",
        Some(&["selected.txt".into(), "new.txt".into()]),
        false,
    )
    .await
    .unwrap();
    assert_eq!(
        output(repo, &["ls-tree", "--name-only", "HEAD"]).await,
        "new.txt\nunselected.txt"
    );
    assert_eq!(
        output(repo, &["diff", "--cached", "--name-only"]).await,
        "unselected.txt"
    );
}

#[tokio::test]
async fn selected_amend_keeps_other_staged_changes_and_reuses_the_message() {
    let dir = fixture().await;
    let repo = dir.path().to_str().unwrap();
    std::fs::write(dir.path().join("selected.txt"), "amended\n").unwrap();
    std::fs::write(dir.path().join("unselected.txt"), "unselected staged\n").unwrap();
    git(dir.path(), &["add", "unselected.txt"]).await;
    commit(repo, "", Some(&["selected.txt".into()]), true)
        .await
        .unwrap();
    assert_eq!(last_commit_message(repo).await.unwrap(), "baseline");
    assert_eq!(output(repo, &["rev-list", "--count", "HEAD"]).await, "1");
    assert_eq!(
        output(repo, &["show", "HEAD:unselected.txt"]).await,
        "unselected base"
    );
    assert_eq!(
        output(repo, &["diff", "--cached", "--name-only"]).await,
        "unselected.txt"
    );
}

#[tokio::test]
async fn selecting_a_displayed_rename_commits_both_names_only() {
    let dir = fixture().await;
    let repo = dir.path().to_str().unwrap();
    git(dir.path(), &["mv", "selected.txt", "renamed.txt"]).await;
    std::fs::write(dir.path().join("unselected.txt"), "unselected staged\n").unwrap();
    git(dir.path(), &["add", "unselected.txt"]).await;
    commit(repo, "rename", Some(&["renamed.txt".into()]), false)
        .await
        .unwrap();
    assert_eq!(
        output(repo, &["ls-tree", "--name-only", "HEAD"]).await,
        "renamed.txt\nunselected.txt"
    );
    assert_eq!(
        output(repo, &["diff", "--cached", "--name-only"]).await,
        "unselected.txt"
    );
}
