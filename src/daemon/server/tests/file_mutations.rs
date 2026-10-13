//! File and hunk mutation replies describe completed work, never just enqueue.

use super::*;
use crate::daemon::diff::testsupport::{git, init_repo};
use crate::daemon::Daemon;
use crate::registry::ProjectEntry;

fn project(repo: &std::path::Path) -> (DaemonHandle, Arc<ServerLifecycle>) {
    let handle = Daemon::spawn(
        vec![ProjectEntry {
            name: "demo".into(),
            path: repo.to_string_lossy().into_owned(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        }],
        None,
    );
    (
        handle,
        Arc::new(ServerLifecycle::new(wire::DaemonOwner::Desktop)),
    )
}

fn reject(project: &str, hunk_index: u32) -> wire::Method {
    wire::Method::DiffResolveHunk {
        task_id: String::new(),
        project: Some(project.into()),
        file: "lines.txt".into(),
        hunk_index,
        resolution: wire::HunkResolution::Reject,
    }
}

#[tokio::test]
async fn hunk_reply_waits_until_the_revert_is_complete_and_keeps_order() {
    let dir = tempfile::tempdir().unwrap();
    init_repo(dir.path()).await;
    let original = (1..=40).map(|n| format!("line {n}\n")).collect::<String>();
    std::fs::write(dir.path().join("lines.txt"), &original).unwrap();
    git(dir.path(), &["add", "."]).await;
    git(dir.path(), &["commit", "-qm", "initial"]).await;
    let modified = original
        .replace("line 3\n", "edited 3\n")
        .replace("line 35\n", "edited 35\n");
    std::fs::write(dir.path().join("lines.txt"), modified).unwrap();
    let (handle, lifecycle) = project(dir.path());
    let diff = handle.diff("", false, Some("demo".into())).await;
    assert_eq!(diff.files[0].hunks.len(), 2);

    dispatch(&handle, reject("demo", 1), &lifecycle)
        .await
        .unwrap();
    let after_first = std::fs::read_to_string(dir.path().join("lines.txt")).unwrap();
    assert!(after_first.contains("edited 3\n"));
    assert!(!after_first.contains("edited 35\n"));
    dispatch(&handle, reject("demo", 0), &lifecycle)
        .await
        .unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.path().join("lines.txt")).unwrap(),
        original
    );
    handle.shutdown().await;
}

#[tokio::test]
async fn hunk_failures_are_returned_without_touching_the_file() {
    let dir = tempfile::tempdir().unwrap();
    init_repo(dir.path()).await;
    std::fs::write(dir.path().join("lines.txt"), "base\n").unwrap();
    git(dir.path(), &["add", "."]).await;
    git(dir.path(), &["commit", "-qm", "initial"]).await;
    std::fs::write(dir.path().join("lines.txt"), "edited\n").unwrap();
    let (handle, lifecycle) = project(dir.path());

    let missing = dispatch(&handle, reject("missing", 0), &lifecycle)
        .await
        .unwrap_err();
    assert_eq!(missing.message, "no repo for project missing");
    let invalid = dispatch(&handle, reject("demo", 99), &lifecycle)
        .await
        .unwrap_err();
    assert!(
        invalid.message.contains("out of range"),
        "{}",
        invalid.message
    );
    assert_eq!(
        std::fs::read_to_string(dir.path().join("lines.txt")).unwrap(),
        "edited\n"
    );
    handle.shutdown().await;
}

#[tokio::test]
async fn binary_read_and_save_refusals_reach_the_rpc_caller() {
    let dir = tempfile::tempdir().unwrap();
    let bytes = [0xff, 0, b'x'];
    std::fs::write(dir.path().join("binary.dat"), bytes).unwrap();
    let (handle, lifecycle) = project(dir.path());
    let read = dispatch(
        &handle,
        wire::Method::FileContents {
            project: Some("demo".into()),
            task_id: String::new(),
            path: "binary.dat".into(),
        },
        &lifecycle,
    )
    .await
    .unwrap_err();
    assert_ne!(read.code, wire::ErrorCode::NotFound);
    assert!(read.message.contains("cannot be edited as text"));
    let save = dispatch(
        &handle,
        wire::Method::FileSave {
            project: Some("demo".into()),
            task_id: String::new(),
            path: "binary.dat".into(),
            content: String::new(),
        },
        &lifecycle,
    )
    .await
    .unwrap_err();
    assert!(save.message.contains("cannot be edited as text"));
    assert_eq!(std::fs::read(dir.path().join("binary.dat")).unwrap(), bytes);

    // Docs uses an empty document at a new path to begin creating text.
    let created = dispatch(
        &handle,
        wire::Method::FileContents {
            project: Some("demo".into()),
            task_id: String::new(),
            path: "new.md".into(),
        },
        &lifecycle,
    )
    .await
    .unwrap();
    assert_eq!(created["newText"], "");
    std::fs::write(dir.path().join("stale.md"), bytes).unwrap();
    let doc_save = dispatch(
        &handle,
        wire::Method::DocsWrite {
            project: "demo".into(),
            path: "stale.md".into(),
            content: "stale text".into(),
        },
        &lifecycle,
    )
    .await
    .unwrap_err();
    assert!(doc_save.message.contains("cannot be edited as text"));
    assert_eq!(std::fs::read(dir.path().join("stale.md")).unwrap(), bytes);
    handle.shutdown().await;
}

#[cfg(unix)]
#[tokio::test]
async fn docs_save_does_not_follow_a_symlink_outside_the_project() {
    let dir = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("private.md"), "preserve outside text").unwrap();
    std::os::unix::fs::symlink(outside.path(), dir.path().join("linked")).unwrap();
    let (handle, lifecycle) = project(dir.path());
    let error = dispatch(
        &handle,
        wire::Method::DocsWrite {
            project: "demo".into(),
            path: "linked/private.md".into(),
            content: "wrong text".into(),
        },
        &lifecycle,
    )
    .await
    .unwrap_err();
    assert!(error.message.contains("outside the root"));
    assert_eq!(
        std::fs::read_to_string(outside.path().join("private.md")).unwrap(),
        "preserve outside text"
    );
    handle.shutdown().await;
}

#[cfg(unix)]
#[tokio::test]
async fn docs_index_skips_external_links_and_directory_cycles() {
    let dir = tempfile::tempdir().unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("own.md"), "# Own document").unwrap();
    std::fs::write(outside.path().join("private.md"), "# Outside document").unwrap();
    std::os::unix::fs::symlink(outside.path(), dir.path().join("external")).unwrap();
    std::os::unix::fs::symlink(dir.path(), dir.path().join("cycle")).unwrap();
    std::os::unix::fs::symlink(
        outside.path().join("private.md"),
        dir.path().join("linked.md"),
    )
    .unwrap();
    let (handle, lifecycle) = project(dir.path());
    let docs = tokio::time::timeout(
        std::time::Duration::from_secs(2),
        dispatch(
            &handle,
            wire::Method::DocsList {
                project: "demo".into(),
            },
            &lifecycle,
        ),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(docs["docs"].as_array().unwrap().len(), 1);
    assert_eq!(docs["docs"][0]["path"], "own.md");
    handle.shutdown().await;
}
