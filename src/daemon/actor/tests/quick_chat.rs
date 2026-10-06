use crate::daemon::actor::session::CHAT_ORIGIN;
use crate::daemon::actor::*;
use crate::daemon::task::{Task, TaskStatus};
use crate::registry::ProjectEntry;
use std::time::Duration;
use tokio::sync::oneshot;
use warpforge_protocol as wire;

const MOCK_AGENT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/mock-acp-inspect.mjs"
);

fn spawn(dir: &tempfile::TempDir) -> DaemonHandle {
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

/// What the desktop's "New chat" sends: no prompt, no session yet.
async fn create_unstarted(handle: &DaemonHandle, origin: Option<&str>) -> String {
    let (tx, rx) = oneshot::channel();
    handle
        .send(Command::CreateTask {
            project: "demo".into(),
            prompt: String::new(),
            agent: format!("node {MOCK_AGENT}"),
            tags: Vec::new(),
            include_runtime_context: true,
            worktree: false,
            worktree_base: Default::default(),
            parent_task_id: None,
            attachments: Vec::new(),
            default_model: None,
            config_overrides: Default::default(),
            backlog_item_id: None,
            origin: origin.map(str::to_string),
            start: false,
            advisor: None,
            reply: tx,
        })
        .await;
    rx.await.unwrap()
}

async fn task_now(handle: &DaemonHandle, id: &str) -> Task {
    handle
        .tasks()
        .await
        .into_iter()
        .find(|t| t.id == id)
        .expect("task on the board")
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_chats_first_message_starts_it_and_becomes_the_prompt() {
    let dir = tempfile::tempdir().unwrap();
    let handle = spawn(&dir);
    let id = create_unstarted(&handle, Some(CHAT_ORIGIN)).await;
    assert_eq!(task_now(&handle, &id).await.status, TaskStatus::Queued);

    let mut events = handle.subscribe();
    handle
        .session_prompt(&id, "what does this repo do?", vec![])
        .await
        .expect("a chat accepts its first message");

    let echoed = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(Event::SessionUpdate { task_id, update }) = events.recv().await {
                if let (true, wire::SessionUpdate::UserMessage { text, .. }) =
                    (task_id == id, update)
                {
                    break text;
                }
            }
        }
    })
    .await
    .expect("the first message is echoed into the transcript");
    assert_eq!(echoed, "what does this repo do?");

    let task = task_now(&handle, &id).await;
    assert_eq!(task.prompt, "what does this repo do?");
    assert_eq!(task.worktree, None, "a chat runs in the project checkout");
    handle.shutdown().await;
}

/// A Factory task also waits Queued without a session; a message must not
/// start it around the project's limits.
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn a_message_does_not_start_an_unstarted_task_that_is_not_a_chat() {
    let dir = tempfile::tempdir().unwrap();
    let handle = spawn(&dir);
    let id = create_unstarted(&handle, None).await;

    let sent = handle.session_prompt(&id, "go", vec![]).await;
    assert!(sent.is_err(), "only a chat starts on its first message");
    assert_eq!(task_now(&handle, &id).await.status, TaskStatus::Queued);
    handle.shutdown().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn clearing_the_origin_makes_a_chat_an_ordinary_task() {
    let dir = tempfile::tempdir().unwrap();
    let handle = spawn(&dir);
    let id = create_unstarted(&handle, Some(CHAT_ORIGIN)).await;

    handle.set_task_origin(&id, None).await;
    assert_eq!(task_now(&handle, &id).await.origin, None);

    handle.set_task_origin(&id, Some(CHAT_ORIGIN.into())).await;
    assert_eq!(
        task_now(&handle, &id).await.origin.as_deref(),
        Some(CHAT_ORIGIN)
    );
    handle.shutdown().await;
}
