use std::path::Path;
use std::sync::{Arc, Mutex};

use super::deliver::{deliver, Delivery, DeliveryJob, PrOpener};
use crate::daemon::diff::testsupport::{git, init_repo};

/// A checkout on `branch` cloned from a bare origin with one commit on `main`.
async fn checkout(root: &Path, branch: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    let origin = root.join("origin.git");
    let seed = root.join("seed");
    let work = root.join("work");
    git(
        root,
        &[
            "init",
            "-q",
            "--bare",
            "-b",
            "main",
            origin.to_str().unwrap(),
        ],
    )
    .await;
    init_repo(&seed).await;
    git(&seed, &["checkout", "-q", "-b", "main"]).await;
    std::fs::write(seed.join("a.txt"), "a\n").unwrap();
    git(&seed, &["add", "."]).await;
    git(&seed, &["commit", "-q", "-m", "seed"]).await;
    git(&seed, &["push", "-q", origin.to_str().unwrap(), "main"]).await;
    git(
        root,
        &[
            "clone",
            "-q",
            origin.to_str().unwrap(),
            work.to_str().unwrap(),
        ],
    )
    .await;
    git(&work, &["config", "user.email", "t@t"]).await;
    git(&work, &["config", "user.name", "t"]).await;
    git(
        &work,
        &["checkout", "-q", "--no-track", "-b", branch, "origin/main"],
    )
    .await;
    (work, origin)
}

fn job(work: &Path) -> DeliveryJob {
    DeliveryJob {
        project_path: work.to_string_lossy().into_owned(),
        worktree: work.to_string_lossy().into_owned(),
        base: Some("main".into()),
        title: "Fix it (#87)".into(),
        message: "Fix it (#87)\n\nChanged a.txt.".into(),
        body: "Closes #87".into(),
    }
}

/// Every pull request asked for: `(title, base)`.
type Calls = Arc<Mutex<Vec<(String, Option<String>)>>>;

fn opener(calls: Calls) -> PrOpener {
    Arc::new(move |_repo, title, _body, base| {
        calls.lock().unwrap().push((title, base));
        Box::pin(async { Ok("https://github.com/o/r/pull/42".to_string()) })
    })
}

#[tokio::test]
async fn delivery_commits_pushes_and_opens_a_draft_on_the_task_branch() {
    let root = tempfile::tempdir().unwrap();
    let (work, origin) = checkout(root.path(), "warpforge/task/t1").await;
    let calls: Calls = Arc::default();

    let clean = deliver(job(&work), opener(Arc::clone(&calls))).await;
    assert_eq!(clean, Delivery::NoChanges);

    std::fs::create_dir_all(work.join(warpforge_protocol::identity::DIR)).unwrap();
    std::fs::write(
        work.join(".orchestrai/workspace.yaml"),
        "name: t\nworktree:\n  copy: [\".env\", \".orchestrai/*.yaml\"]\n",
    )
    .unwrap();
    std::fs::write(work.join(".env"), "SECRET=1\n").unwrap();
    assert_eq!(
        deliver(job(&work), opener(Arc::clone(&calls))).await,
        Delivery::NoChanges,
        "copied local files alone are not a change"
    );

    std::fs::write(work.join("a.txt"), "changed\n").unwrap();
    std::fs::write(work.join("new.txt"), "new\n").unwrap();
    let opened = deliver(job(&work), opener(Arc::clone(&calls))).await;
    assert_eq!(
        opened,
        Delivery::Opened {
            url: "https://github.com/o/r/pull/42".into(),
            number: Some(42),
        }
    );
    assert_eq!(
        calls.lock().unwrap().as_slice(),
        [("Fix it (#87)".to_string(), Some("main".to_string()))]
    );
    let log = std::process::Command::new("git")
        .arg("--git-dir")
        .arg(&origin)
        .args(["log", "-1", "--format=%s%n%b", "warpforge/task/t1"])
        .output()
        .unwrap();
    let log = String::from_utf8_lossy(&log.stdout);
    assert!(log.starts_with("Fix it (#87)\n"), "{log}");
    assert!(log.contains("Changed a.txt."), "{log}");
    let files = std::process::Command::new("git")
        .arg("--git-dir")
        .arg(&origin)
        .args(["show", "--name-only", "--format=", "warpforge/task/t1"])
        .output()
        .unwrap();
    let files = String::from_utf8_lossy(&files.stdout);
    assert_eq!(
        files.lines().collect::<Vec<_>>(),
        ["a.txt", "new.txt"],
        "{files}"
    );

    // A pushed branch with no new edits is still a change to deliver.
    let again = deliver(job(&work), opener(Arc::clone(&calls))).await;
    assert!(matches!(again, Delivery::Opened { .. }), "{again:?}");
}

#[tokio::test]
async fn delivery_refuses_a_branch_it_did_not_create_and_reports_a_failed_push() {
    let root = tempfile::tempdir().unwrap();
    let (work, origin) = checkout(root.path(), "feature/mine").await;
    std::fs::write(work.join("a.txt"), "changed\n").unwrap();
    let calls: Calls = Arc::default();
    let refused = deliver(job(&work), opener(Arc::clone(&calls))).await;
    assert!(
        matches!(&refused, Delivery::Failed(reason) if reason.contains("not a branch the Factory created")),
        "{refused:?}"
    );

    git(&work, &["checkout", "-q", "-b", "warpforge/task/t2"]).await;
    std::fs::remove_dir_all(&origin).unwrap();
    let failed = deliver(job(&work), opener(Arc::clone(&calls))).await;
    assert!(matches!(failed, Delivery::Failed(_)), "{failed:?}");
    assert!(
        calls.lock().unwrap().is_empty(),
        "no pull request without a push"
    );
}
