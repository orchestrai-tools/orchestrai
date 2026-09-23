use super::*;

#[tokio::test]
async fn create_and_remove_worktree() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().to_path_buf();

    // Init a git repo.
    tokio::process::Command::new("git")
        .args(["init"])
        .current_dir(&repo)
        .status()
        .await
        .unwrap();

    // Create an initial commit (worktree needs at least one commit).
    std::fs::write(repo.join("README.md"), "init").unwrap();
    tokio::process::Command::new("git")
        .args(["add", "."])
        .current_dir(&repo)
        .status()
        .await
        .unwrap();
    tokio::process::Command::new("git")
        .args(["commit", "-m", "init", "--author", "test <t@t>"])
        .current_dir(&repo)
        .env("GIT_AUTHOR_NAME", "test")
        .env("GIT_AUTHOR_EMAIL", "t@t")
        .env("GIT_COMMITTER_NAME", "test")
        .env("GIT_COMMITTER_EMAIL", "t@t")
        .status()
        .await
        .unwrap();

    let mut mgr = WorktreeManager::new(repo.clone());
    let wt = mgr.create("t_abc123", None).await.unwrap();
    assert!(wt.path.exists());
    assert!(wt.branch.contains("t_abc123"));
    assert!(mgr.has_worktree("t_abc123"));

    let list = mgr.list();
    assert_eq!(list.len(), 1);

    mgr.remove("t_abc123").await.unwrap();
    assert!(!mgr.has_worktree("t_abc123"));
    assert_eq!(mgr.list().len(), 0);
}

#[tokio::test]
async fn create_detached_hides_worktrees_via_info_exclude() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().to_path_buf();
    git_init_with_commit(&repo).await;

    // Two creations must leave the exclude file with exactly one entry.
    create_detached(&repo, "t_a", None).await.unwrap();
    create_detached(&repo, "t_b", None).await.unwrap();

    let status = tokio::process::Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&repo)
        .output()
        .await
        .unwrap();
    let status = String::from_utf8_lossy(&status.stdout);
    assert!(
        !status.contains(".worktrees"),
        "worktrees must not show as untracked, got: {status:?}"
    );

    let exclude = tokio::process::Command::new("git")
        .args(["rev-parse", "--git-path", "info/exclude"])
        .current_dir(&repo)
        .output()
        .await
        .unwrap();
    let raw = String::from_utf8_lossy(&exclude.stdout).trim().to_string();
    let path = if std::path::Path::new(&raw).is_absolute() {
        std::path::PathBuf::from(raw)
    } else {
        repo.join(raw)
    };
    let text = std::fs::read_to_string(&path).unwrap();
    assert_eq!(
        text.lines().filter(|l| l.trim() == ".worktrees/").count(),
        1,
        "exclude must hold one .worktrees/ line, got: {text:?}"
    );
}

#[tokio::test]
async fn branched_worktree_inherits_source_state() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().to_path_buf();
    let git = |args: &[&str], dir: &std::path::Path| {
        tokio::process::Command::new("git")
            .args(args)
            .current_dir(dir)
            .env("GIT_AUTHOR_NAME", "test")
            .env("GIT_AUTHOR_EMAIL", "t@t")
            .env("GIT_COMMITTER_NAME", "test")
            .env("GIT_COMMITTER_EMAIL", "t@t")
            .status()
    };

    // Init a repo with an initial commit.
    git(&["init"], &repo).await.unwrap();
    std::fs::write(repo.join("README.md"), "init\n").unwrap();
    git(&["add", "."], &repo).await.unwrap();
    git(&["commit", "-m", "init"], &repo).await.unwrap();

    let mut mgr = WorktreeManager::new(repo.clone());
    let src = mgr.create("t_source", None).await.unwrap();

    // The source agent edits a tracked file and adds a new file, without committing.
    tokio::fs::write(src.path.join("README.md"), "edited\n")
        .await
        .unwrap();
    tokio::fs::write(src.path.join("NEW.md"), "new file\n")
        .await
        .unwrap();

    let branch = mgr.create_branched("t_branch", "t_source").await.unwrap();
    assert_ne!(branch.path, src.path);
    assert_eq!(branch.base_branch, src.branch);

    // The tracked edit and the new untracked file must carry over.
    let readme = tokio::fs::read_to_string(branch.path.join("README.md"))
        .await
        .unwrap();
    assert_eq!(readme, "edited\n");
    let new = tokio::fs::read_to_string(branch.path.join("NEW.md"))
        .await
        .unwrap();
    assert_eq!(new, "new file\n");
}

#[test]
fn parses_worktree_list_porcelain() {
    let output = "\
worktree /repo
HEAD 1111111111111111111111111111111111111111
branch refs/heads/main

worktree /repo/.worktrees/t_abc
HEAD 2222222222222222222222222222222222222222
branch refs/heads/warpforge/task/t_abc

worktree /repo/.worktrees/detached
HEAD 3333333333333333333333333333333333333333
detached
";
    let parsed = parse_worktree_list(output);
    assert_eq!(parsed.len(), 3);
    assert_eq!(parsed[0].path, PathBuf::from("/repo"));
    assert_eq!(parsed[0].branch.as_deref(), Some("main"));
    assert!(!parsed[0].detached);
    assert_eq!(parsed[1].branch.as_deref(), Some("warpforge/task/t_abc"));
    assert_eq!(parsed[2].branch, None);
    assert!(parsed[2].detached);
}

#[tokio::test]
async fn restore_adopts_live_worktrees_and_reports_missing() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().to_path_buf();
    git_init_with_commit(&repo).await;

    let mut mgr = WorktreeManager::new(repo.clone());
    let live = mgr.create("t_live", None).await.unwrap();
    // A task whose recorded checkout no longer exists on disk.
    let gone = repo.join(".worktrees/t_gone");

    let porcelain = tokio::process::Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&repo)
        .output()
        .await
        .unwrap();
    let porcelain = String::from_utf8_lossy(&porcelain.stdout).into_owned();

    let mut fresh = WorktreeManager::new(repo.clone());
    let missing = fresh.restore(
        &[
            (
                "t_live".to_string(),
                live.path.to_string_lossy().into_owned(),
                None,
            ),
            (
                "t_gone".to_string(),
                gone.to_string_lossy().into_owned(),
                None,
            ),
        ],
        Some(&porcelain),
    );

    assert!(
        fresh.has_worktree("t_live"),
        "live worktree must be adopted"
    );
    assert_eq!(
        fresh.get("t_live").unwrap().branch,
        format!("warpforge/task/t_live")
    );
    assert_eq!(missing, vec!["t_gone".to_string()]);
    assert!(!fresh.has_worktree("t_gone"));
}

#[tokio::test]
async fn restore_without_porcelain_adopts_and_clears_nothing() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().to_path_buf();
    let recorded = repo.join(".worktrees/t_a");
    std::fs::create_dir_all(&recorded).unwrap();

    let mut mgr = WorktreeManager::new(repo);
    let missing = mgr.restore(
        &[(
            "t_a".to_string(),
            recorded.to_string_lossy().into_owned(),
            None,
        )],
        None,
    );

    assert!(
        missing.is_empty(),
        "a failed git call reports nothing missing"
    );
    assert!(!mgr.has_worktree("t_a"), "a failed git call adopts nothing");
}

#[tokio::test]
async fn restore_keeps_an_unlisted_path_that_still_exists() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().to_path_buf();
    let dir = repo.join(".worktrees/t_orphan");
    std::fs::create_dir_all(&dir).unwrap();

    let mut mgr = WorktreeManager::new(repo);
    let missing = mgr.restore(
        &[(
            "t_orphan".to_string(),
            dir.to_string_lossy().into_owned(),
            None,
        )],
        Some(""),
    );

    assert!(
        missing.is_empty(),
        "an unlisted directory that still exists must not be cleared"
    );
    assert!(
        !mgr.has_worktree("t_orphan"),
        "an unlisted directory is not adopted"
    );
}

#[tokio::test]
async fn restore_clears_an_unlisted_path_that_is_gone() {
    let tmp = tempfile::tempdir().unwrap();
    let repo = tmp.path().to_path_buf();
    let gone = repo.join(".worktrees/t_gone");

    let mut mgr = WorktreeManager::new(repo);
    let missing = mgr.restore(
        &[(
            "t_gone".to_string(),
            gone.to_string_lossy().into_owned(),
            None,
        )],
        Some(""),
    );

    assert_eq!(missing, vec!["t_gone".to_string()]);
    assert!(!mgr.has_worktree("t_gone"));
}

async fn git_init_with_commit(repo: &std::path::Path) {
    let git = |args: &[&str]| {
        tokio::process::Command::new("git")
            .args(args)
            .current_dir(repo)
            .env("GIT_AUTHOR_NAME", "test")
            .env("GIT_AUTHOR_EMAIL", "t@t")
            .env("GIT_COMMITTER_NAME", "test")
            .env("GIT_COMMITTER_EMAIL", "t@t")
            .status()
    };
    git(&["init"]).await.unwrap();
    std::fs::write(repo.join("README.md"), "init\n").unwrap();
    git(&["add", "."]).await.unwrap();
    git(&["commit", "-m", "init"]).await.unwrap();
}
