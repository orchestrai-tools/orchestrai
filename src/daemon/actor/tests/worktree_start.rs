use crate::daemon::actor::*;
use crate::daemon::store::Store;
use crate::daemon::task::Task;
use crate::daemon::task::TaskStatus;
use crate::registry::ProjectEntry;
use std::time::Duration;
use warpforge_protocol as wire;

const MOCK_AGENT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/mock-acp-inspect.mjs"
);

/// A git repo with one commit, so `git worktree add` has something to
/// branch from.
async fn repo_with_commit() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let git = |args: &[&str]| {
        tokio::process::Command::new("git")
            .args(args)
            .current_dir(dir.path())
            .env("GIT_AUTHOR_NAME", "test")
            .env("GIT_AUTHOR_EMAIL", "t@t")
            .env("GIT_COMMITTER_NAME", "test")
            .env("GIT_COMMITTER_EMAIL", "t@t")
            .status()
    };
    git(&["init"]).await.unwrap();
    std::fs::write(dir.path().join("README.md"), "init\n").unwrap();
    git(&["add", "."]).await.unwrap();
    git(&["commit", "-m", "init"]).await.unwrap();
    dir
}

async fn spawn_with_repo(dir: &tempfile::TempDir) -> DaemonHandle {
    Daemon::spawn(
        vec![ProjectEntry {
            name: "demo".into(),
            path: dir.path().to_string_lossy().into_owned(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        }],
        None,
    )
}

fn project_entry(dir: &std::path::Path) -> ProjectEntry {
    ProjectEntry {
        name: "demo".into(),
        path: dir.to_string_lossy().into_owned(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }
}

/// Poll until the task's checkout attaches, returning its path.
async fn wait_for_worktree(handle: &DaemonHandle, id: &str) -> String {
    for _ in 0..200 {
        if let Some(path) = task_now(handle, id).await.worktree {
            return path;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    panic!("worktree never attached");
}

/// Poll until the task is blocked (a failed checkout).
async fn wait_for_blocked(handle: &DaemonHandle, id: &str) -> Task {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let task = task_now(handle, id).await;
            if task.status == TaskStatus::Blocked {
                break task;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    })
    .await
    .expect("task never blocked")
}

async fn create_worktree_task(handle: &DaemonHandle) -> String {
    create_worktree_task_with(handle, "do the thing", Vec::new()).await
}

async fn create_worktree_task_with(
    handle: &DaemonHandle,
    prompt: &str,
    attachments: Vec<wire::PromptAttachment>,
) -> String {
    handle
        .create_task(
            "demo",
            prompt,
            &format!("node {MOCK_AGENT}"),
            Vec::new(),
            false,
            true,
            None,
            attachments,
            None,
            Default::default(),
            None,
        )
        .await
}

fn document_attachment() -> wire::PromptAttachment {
    wire::PromptAttachment::Document {
        name: "notes.txt".into(),
        mime_type: "text/plain".into(),
        text: "attached context".into(),
    }
}

/// The text and attachment-summary count of the next user message for `id`.
async fn wait_for_user_message(
    events: &mut tokio::sync::broadcast::Receiver<Event>,
    id: &str,
) -> (String, usize) {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(Event::SessionUpdate { task_id, update }) = events.recv().await {
                if task_id == id {
                    if let wire::SessionUpdate::UserMessage { text, attachments } = update {
                        return (text, attachments.len());
                    }
                }
            }
        }
    })
    .await
    .expect("a retry must emit a user message")
}

async fn task_now(handle: &DaemonHandle, id: &str) -> Task {
    handle
        .tasks()
        .await
        .into_iter()
        .find(|t| t.id == id)
        .expect("task on the board")
}

/// The task must reach the board before its checkout finishes. It used to
/// be created only after `git worktree add` returned, so starting a task
/// held up every other task's messages and approvals (ADR 0002).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn task_appears_before_its_worktree_is_ready() {
    let dir = repo_with_commit().await;
    let handle = spawn_with_repo(&dir).await;

    let id = create_worktree_task(&handle).await;
    assert!(!id.is_empty());
    assert_eq!(
        task_now(&handle, &id).await.worktree,
        None,
        "create must return before the checkout, not after it"
    );

    // The worktree is attached once the checkout lands.
    let mut path = None;
    for _ in 0..100 {
        if let Some(p) = task_now(&handle, &id).await.worktree {
            path = Some(p);
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let path = path.expect("checkout should attach a worktree");
    assert!(std::path::Path::new(&path).exists(), "worktree on disk");

    handle.shutdown().await;
}

/// Branching a conversation whose source runs in the project checkout —
/// no worktree of its own — must still carry the uncommitted work over.
///
/// This regressed once: the lookup only knew how to find a source
/// *worktree*, so a source without one silently produced a branch on a
/// clean HEAD, and the change the user was continuing from was gone.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn branching_from_the_project_checkout_carries_its_changes() {
    let dir = repo_with_commit().await;
    let handle = spawn_with_repo(&dir).await;

    // The source task has no worktree, and its checkout has uncommitted
    // work: one tracked edit and one new file.
    let source = handle
        .create_task(
            "demo",
            "source",
            &format!("node {MOCK_AGENT}"),
            Vec::new(),
            false,
            false,
            None,
            Vec::new(),
            None,
            Default::default(),
            None,
        )
        .await;
    std::fs::write(dir.path().join("README.md"), "edited\n").unwrap();
    std::fs::write(dir.path().join("NEW.md"), "new file\n").unwrap();

    let branch = handle
        .create_task(
            "demo",
            "branch",
            &format!("node {MOCK_AGENT}"),
            vec![format!("branched-from:{source}")],
            false,
            true,
            None,
            Vec::new(),
            None,
            Default::default(),
            None,
        )
        .await;

    let mut path = None;
    for _ in 0..100 {
        if let Some(p) = task_now(&handle, &branch).await.worktree {
            path = Some(p);
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let path = std::path::PathBuf::from(path.expect("branch should get a worktree"));

    assert_eq!(
        std::fs::read_to_string(path.join("README.md")).unwrap(),
        "edited\n",
        "the tracked edit must carry over"
    );
    assert_eq!(
        std::fs::read_to_string(path.join("NEW.md")).unwrap(),
        "new file\n",
        "the new untracked file must carry over"
    );

    handle.shutdown().await;
}

/// Cancelling while the checkout is still running must not start a session
/// when it lands — but the worktree still gets recorded, because it exists
/// on disk and something has to be able to clean it up.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cancelling_during_checkout_does_not_start_a_session() {
    let dir = repo_with_commit().await;
    let handle = spawn_with_repo(&dir).await;

    let id = create_worktree_task(&handle).await;
    handle.cancel_task(&id).await.ok();

    // Wait for the checkout to land, then give a session every chance to
    // start before concluding that none did.
    for _ in 0..100 {
        if task_now(&handle, &id).await.worktree.is_some() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    tokio::time::sleep(Duration::from_millis(300)).await;

    let task = task_now(&handle, &id).await;
    assert!(
        task.worktree.is_some(),
        "the checkout must still be recorded so it can be cleaned up"
    );
    assert_eq!(
        task.session_id, None,
        "a cancelled task must not be started by its own checkout"
    );

    handle.shutdown().await;
}

/// A checkout that cannot be created must not quietly run the task in the
/// project checkout: the task is blocked with the git error so the attention
/// rail can surface it.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_failed_checkout_blocks_the_task_and_reports_it() {
    // Not a git repo, so `git worktree add` cannot succeed.
    let dir = tempfile::tempdir().unwrap();
    let handle = Daemon::spawn(vec![project_entry(dir.path())], None);
    let id = create_worktree_task(&handle).await;

    let task = wait_for_blocked(&handle, &id).await;

    let reason = task.blocked_reason.unwrap_or_default();
    assert!(
        reason.contains("worktree"),
        "reason must name the worktree: {reason}"
    );
    assert!(
        reason.contains("git"),
        "reason must carry the git error: {reason}"
    );
    assert!(
        !reason.contains('\x1b'),
        "reason must be plain text: {reason}"
    );

    handle.shutdown().await;
}

/// A task blocked by a failed checkout is not stuck: sending a message retries
/// it in the project checkout with the task's original prompt and attachments.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_blocked_task_can_be_retried_in_the_project_checkout() {
    // Not a git repo, so the checkout fails and the task is blocked.
    let dir = tempfile::tempdir().unwrap();
    let handle = Daemon::spawn(vec![project_entry(dir.path())], None);
    let id = create_worktree_task_with(&handle, "do the thing", vec![document_attachment()]).await;
    let task = wait_for_blocked(&handle, &id).await;
    assert_eq!(task.worktree, None, "a failed checkout leaves no worktree");
    assert!(
        task.blocked_reason
            .unwrap_or_default()
            .contains("project checkout"),
        "the reason must tell the user their options"
    );

    let mut events = handle.subscribe();
    handle
        .session_prompt(&id, "try again", vec![])
        .await
        .expect("a blocked task accepts a retry message");

    let (text, attachment_count) = wait_for_user_message(&mut events, &id).await;
    assert!(
        text.contains("do the thing"),
        "the retry must carry the task's original prompt: {text}"
    );
    assert!(
        text.contains("try again"),
        "the retry must carry the user's message: {text}"
    );
    assert_eq!(
        attachment_count, 1,
        "the task's stashed attachments must survive the retry"
    );

    let task = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let task = task_now(&handle, &id).await;
            if task.session_id.is_some() || task.status == TaskStatus::Running {
                break task;
            }
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    })
    .await
    .expect("the retry must start a session");

    assert_eq!(
        task.worktree, None,
        "the retry runs in the project checkout"
    );
    handle.shutdown().await;
}

/// After a restart the stashed start is gone: the retry falls back to the
/// persisted task prompt, with no attachments.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn retry_after_restart_falls_back_to_the_task_prompt() {
    let dir = tempfile::tempdir().unwrap();
    let db_dir = tempfile::tempdir().unwrap();
    let db_path = db_dir.path().join("warpforge.db");

    let store = Store::open_at(&db_path).unwrap();
    let handle = Daemon::spawn(vec![project_entry(dir.path())], Some(store));
    let id =
        create_worktree_task_with(&handle, "original prompt", vec![document_attachment()]).await;
    wait_for_blocked(&handle, &id).await;
    handle.shutdown().await;

    let store = Store::open_at(&db_path).unwrap();
    let handle = Daemon::spawn(vec![project_entry(dir.path())], Some(store));
    let mut events = handle.subscribe();
    handle
        .session_prompt(&id, "go ahead", vec![])
        .await
        .expect("a blocked task accepts a retry message");

    let (text, attachment_count) = wait_for_user_message(&mut events, &id).await;
    assert!(
        text.contains("original prompt"),
        "the fallback must use the task's persisted prompt: {text}"
    );
    assert!(
        text.contains("go ahead"),
        "the fallback must carry the user's message: {text}"
    );
    assert_eq!(
        attachment_count, 0,
        "there is no stash after a restart, so no attachments"
    );
    handle.shutdown().await;
}

/// A daemon restart rebuilds the worktree manager from the persisted tasks,
/// so deleting a task afterwards still removes its isolated checkout.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn delete_after_restart_removes_the_worktree() {
    let dir = repo_with_commit().await;
    let db_dir = tempfile::tempdir().unwrap();
    let db_path = db_dir.path().join("warpforge.db");

    // First daemon: create the isolated task and let its checkout land.
    let store = Store::open_at(&db_path).unwrap();
    let handle = Daemon::spawn(vec![project_entry(dir.path())], Some(store));
    let id = create_worktree_task(&handle).await;
    let path = wait_for_worktree(&handle, &id).await;
    assert!(std::path::Path::new(&path).exists());
    handle.shutdown().await;

    // Second daemon: same store, same project — the boot rebuild adopts the
    // worktree, so delete can clean it up.
    let store = Store::open_at(&db_path).unwrap();
    let handle = Daemon::spawn(vec![project_entry(dir.path())], Some(store));
    handle.delete_task(&id).await.expect("delete succeeds");

    let mut gone = false;
    for _ in 0..200 {
        if !std::path::Path::new(&path).exists() {
            gone = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    assert!(gone, "delete after restart must remove the worktree");
    handle.shutdown().await;
}

static REMOVE_GATE: std::sync::OnceLock<std::sync::Arc<tokio::sync::Notify>> =
    std::sync::OnceLock::new();

fn slow_remover(
    base_repo: std::path::PathBuf,
    path: std::path::PathBuf,
    branch: String,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = anyhow::Result<()>> + Send>> {
    Box::pin(async move {
        if let Some(gate) = REMOVE_GATE.get() {
            gate.notified().await;
        }
        crate::daemon::worktree::remove_detached(&base_repo, &path, &branch).await
    })
}

/// Worktree removal runs off the actor: deleting a task must reply before the
/// git/fs work finishes, or a big checkout stalls every other task (ADR 0002).
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn deleting_a_task_does_not_wait_for_worktree_removal() {
    let dir = repo_with_commit().await;
    let handle = spawn_with_repo(&dir).await;
    let id = create_worktree_task(&handle).await;
    let path = wait_for_worktree(&handle, &id).await;

    let gate = std::sync::Arc::new(tokio::sync::Notify::new());
    let _ = REMOVE_GATE.set(gate.clone());
    handle
        .send(Command::SetWorktreeRemover {
            remover: slow_remover,
        })
        .await;

    // The reply must arrive while the remover is still blocked.
    handle.delete_task(&id).await.expect("delete replies");
    assert!(
        std::path::Path::new(&path).exists(),
        "the actor must not have awaited the removal"
    );

    gate.notify_one();
    let mut gone = false;
    for _ in 0..200 {
        if !std::path::Path::new(&path).exists() {
            gone = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    assert!(gone, "the detached removal must still run");
    handle.shutdown().await;
}
