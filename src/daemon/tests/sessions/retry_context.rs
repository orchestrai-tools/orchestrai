use super::*;
use warpforge_protocol as wire;

const INSPECT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/mock-acp-inspect.mjs"
);

fn document(number: usize) -> wire::PromptAttachment {
    wire::PromptAttachment::Document {
        name: format!("notes-{number}.txt"),
        mime_type: "text/plain".into(),
        text: format!("context {number}"),
    }
}

async fn blocked_task(daemon: &DaemonHandle, count: usize) -> String {
    // This temp directory has no git repo, so the requested checkout refuses.
    let id = daemon
        .create_task(
            "demo",
            "original task",
            &format!("node {INSPECT}"),
            Vec::new(),
            false,
            true,
            None,
            (0..count).map(document).collect(),
            None,
            Default::default(),
            None,
        )
        .await;
    timeout(Duration::from_secs(5), async {
        loop {
            if daemon
                .tasks()
                .await
                .iter()
                .any(|task| task.id == id && task.status == TaskStatus::Blocked)
            {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("checkout refusal reaches the task");
    id
}

fn daemon(dir: &std::path::Path) -> DaemonHandle {
    Daemon::spawn(
        vec![ProjectEntry {
            name: "demo".into(),
            path: dir.to_string_lossy().into_owned(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        }],
        None,
    )
}

async fn user_message(
    events: &mut tokio::sync::broadcast::Receiver<Event>,
    id: &str,
) -> (String, Vec<wire::PromptAttachmentSummary>) {
    timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(Event::SessionUpdate {
                task_id,
                update: wire::SessionUpdate::UserMessage { text, attachments },
            }) = events.recv().await
            {
                if task_id == id {
                    break (text, attachments);
                }
            }
        }
    })
    .await
    .expect("retry's initial prompt is echoed")
}

#[tokio::test]
async fn retrying_a_blocked_task_keeps_original_and_new_attachments() {
    let dir = tempfile::tempdir().unwrap();
    let daemon = daemon(dir.path());
    let id = blocked_task(&daemon, 1).await;
    let mut events = daemon.subscribe();
    daemon
        .session_prompt(&id, "retry instruction", vec![document(1)])
        .await
        .unwrap();
    let (text, attachments) = user_message(&mut events, &id).await;
    assert_eq!(text, "original task\n\nretry instruction");
    assert_eq!(
        attachments.len(),
        2,
        "both original and retry context reach the agent"
    );
    daemon.shutdown().await;
}

#[tokio::test]
async fn retry_attachment_limits_refuse_without_poisoning_the_original_start() {
    let dir = tempfile::tempdir().unwrap();
    let daemon = daemon(dir.path());
    let id = blocked_task(&daemon, 10).await;
    let mut events = daemon.subscribe();
    let error = daemon
        .session_prompt(&id, "too much", vec![document(10)])
        .await
        .unwrap_err();
    assert!(error.contains("at most 10"));
    assert_eq!(
        daemon
            .tasks()
            .await
            .iter()
            .find(|task| task.id == id)
            .unwrap()
            .status,
        TaskStatus::Blocked
    );
    daemon
        .session_prompt(&id, "retry without the extra file", Vec::new())
        .await
        .unwrap();
    let (_, attachments) = user_message(&mut events, &id).await;
    assert_eq!(
        attachments.len(),
        10,
        "a refused retry leaves the original context intact"
    );
    daemon.shutdown().await;
}
