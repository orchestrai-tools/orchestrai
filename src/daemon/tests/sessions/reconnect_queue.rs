use super::*;
use tokio::sync::oneshot;
use warpforge_protocol as wire;

const FIXTURE: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/tests/fixtures/mock-acp-lifecycle.mjs"
);
const PNG: &str =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

fn setup(image: bool) -> (tempfile::TempDir, DaemonHandle, String) {
    let dir = tempfile::tempdir().unwrap();
    let agent = format!(
        "node {FIXTURE} {} {} {image}",
        dir.path().join("agent.log").display(),
        dir.path().join("initialize.gate").display()
    );
    let store = Store::open_at(&dir.path().join("tasks.db")).unwrap();
    let mut task = Task::new("demo", "saved task", &agent, Vec::new());
    task.attach_session("saved-session".into());
    task.set_status(TaskStatus::Waiting);
    let id = task.id.clone();
    store.upsert_task(&task).unwrap();
    let daemon = Daemon::spawn(
        vec![ProjectEntry {
            name: "demo".into(),
            path: dir.path().to_string_lossy().into_owned(),
            added_at: "0".into(),
            port_range: None,
            port_range_override: None,
        }],
        Some(store),
    );
    (dir, daemon, id)
}

fn submit(
    daemon: &DaemonHandle,
    id: &str,
    text: &str,
    attachments: Vec<wire::PromptAttachment>,
) -> oneshot::Receiver<Result<(), String>> {
    let (tx, rx) = oneshot::channel();
    daemon
        .cmd_tx
        .try_send(Command::SessionPrompt {
            task_id: id.into(),
            text: text.into(),
            attachments,
            initiator: crate::daemon::acp::TurnInitiator::User,
            reply: tx,
        })
        .unwrap();
    rx
}

fn calls(dir: &std::path::Path) -> Vec<serde_json::Value> {
    std::fs::read_to_string(dir.join("agent.log"))
        .unwrap_or_default()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect()
}

async fn wait_calls(dir: &std::path::Path, method: &str, count: usize) -> Vec<serde_json::Value> {
    timeout(Duration::from_secs(5), async {
        loop {
            let all = calls(dir);
            if all.iter().filter(|call| call["method"] == method).count() >= count {
                break all;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("fixture must receive the traffic")
}

fn document(name: &str) -> wire::PromptAttachment {
    wire::PromptAttachment::Document {
        name: name.into(),
        mime_type: "text/plain".into(),
        text: format!("context:{name}"),
    }
}

/// All submissions enter one mailbox before its replay worker can answer.
/// They must survive both the replay read and the gated ACP handshake.
#[tokio::test]
async fn reconnecting_keeps_each_followup_and_attachment_as_an_ordered_turn() {
    let (dir, daemon, id) = setup(true);
    let first = submit(&daemon, &id, "FIRST", vec![document("first.txt")]);
    let second = submit(&daemon, &id, "SECOND", vec![document("second.txt")]);
    timeout(Duration::from_secs(2), first)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    wait_calls(dir.path(), "initialize", 1).await;
    let third = submit(
        &daemon,
        &id,
        "THIRD",
        vec![wire::PromptAttachment::Image {
            name: "third.png".into(),
            mime_type: "image/png".into(),
            data: PNG.into(),
        }],
    );
    // This callback is ordered after the third submission and must still work
    // while the pending image waits for advertised capabilities.
    timeout(Duration::from_secs(2), daemon.read_inbox("barrier"))
        .await
        .unwrap();
    std::fs::write(dir.path().join("initialize.gate"), "go").unwrap();
    timeout(Duration::from_secs(5), second)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    timeout(Duration::from_secs(5), third)
        .await
        .unwrap()
        .unwrap()
        .unwrap();
    let all = wait_calls(dir.path(), "session/prompt", 3).await;
    let loads = all
        .iter()
        .filter(|call| call["method"] == "session/load")
        .count();
    assert_eq!(loads, 1, "a burst starts one resumed session");
    let prompts: Vec<_> = all
        .iter()
        .filter(|call| call["method"] == "session/prompt")
        .collect();
    let texts: Vec<String> = prompts
        .iter()
        .map(|call| {
            call["params"]["prompt"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|block| block["text"].as_str())
                .collect::<Vec<_>>()
                .join("")
        })
        .collect();
    assert!(
        texts[0].contains("FIRST"),
        "first prompt survived: {texts:?}"
    );
    assert_eq!(texts[1], "SECOND");
    assert_eq!(texts[2], "THIRD");
    assert_eq!(prompts[0]["params"]["prompt"].as_array().unwrap().len(), 2);
    assert_eq!(prompts[1]["params"]["prompt"].as_array().unwrap().len(), 2);
    assert_eq!(prompts[2]["params"]["prompt"][1]["type"], "image");
    daemon.shutdown().await;
}

#[tokio::test]
async fn stopping_a_reconnecting_task_rejects_its_waiting_followup() {
    let (dir, daemon, id) = setup(true);
    daemon
        .session_prompt(&id, "FIRST", Vec::new())
        .await
        .unwrap();
    wait_calls(dir.path(), "initialize", 1).await;
    let pending = submit(&daemon, &id, "SECOND", Vec::new());
    daemon.cancel_task(&id).await.unwrap();
    let refused = timeout(Duration::from_secs(2), pending)
        .await
        .unwrap()
        .unwrap()
        .unwrap_err();
    assert!(refused.contains("stopped"));
    std::fs::write(dir.path().join("initialize.gate"), "go").unwrap();
    assert!(!calls(dir.path())
        .iter()
        .any(|call| call["method"] == "session/prompt"));
    daemon.shutdown().await;
}

#[tokio::test]
async fn an_image_queued_during_resume_reports_an_unsupported_agent() {
    let (dir, daemon, id) = setup(false);
    daemon
        .session_prompt(&id, "FIRST", Vec::new())
        .await
        .unwrap();
    wait_calls(dir.path(), "initialize", 1).await;
    let pending = submit(
        &daemon,
        &id,
        "IMAGE",
        vec![wire::PromptAttachment::Image {
            name: "image.png".into(),
            mime_type: "image/png".into(),
            data: PNG.into(),
        }],
    );
    timeout(Duration::from_secs(2), daemon.read_inbox("barrier"))
        .await
        .unwrap();
    std::fs::write(dir.path().join("initialize.gate"), "go").unwrap();
    let refused = timeout(Duration::from_secs(5), pending)
        .await
        .unwrap()
        .unwrap()
        .unwrap_err();
    assert!(refused.contains("does not support image"));
    let all = wait_calls(dir.path(), "session/prompt", 1).await;
    assert_eq!(
        all.iter()
            .filter(|call| call["method"] == "session/load")
            .count(),
        1
    );
    assert!(!all.iter().any(|call| call["params"]["prompt"]
        .as_array()
        .is_some_and(|blocks| blocks.iter().any(|block| block["type"] == "image"))));
    daemon.shutdown().await;
}

#[tokio::test]
async fn unsupported_images_preserve_the_live_turn_and_followup_queue() {
    let (dir, daemon, id) = setup(false);
    daemon
        .session_prompt(&id, "HOLD original turn", Vec::new())
        .await
        .unwrap();
    wait_calls(dir.path(), "initialize", 1).await;
    std::fs::write(dir.path().join("initialize.gate"), "go").unwrap();
    let initial = wait_calls(dir.path(), "session/prompt", 1).await;
    let pid = initial[0]["pid"].as_i64().unwrap() as libc::pid_t;

    let refused = daemon
        .session_prompt(
            &id,
            "rejected image",
            vec![wire::PromptAttachment::Image {
                name: "image.png".into(),
                mime_type: "image/png".into(),
                data: PNG.into(),
            }],
        )
        .await
        .expect_err("unsupported images must not acknowledge a reconnect");
    assert!(refused.contains("does not support image"));
    assert_eq!(unsafe { libc::kill(pid, 0) }, 0, "the agent remains alive");

    daemon
        .session_prompt(&id, "accepted text", Vec::new())
        .await
        .unwrap();
    timeout(Duration::from_secs(2), async {
        loop {
            let task = daemon
                .tasks()
                .await
                .into_iter()
                .find(|t| t.id == id)
                .unwrap();
            assert_eq!(task.status, TaskStatus::Running);
            if !task.queued_prompts.is_empty() {
                assert_eq!(task.queued_prompts.len(), 1);
                assert_eq!(task.queued_prompts[0].text, "accepted text");
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();

    daemon.session_interrupt(&id).await.unwrap();
    // The fixture deliberately ignores cancellation of HOLD. The driver must
    // dispatch the accepted followup once its normal cancellation grace ends.
    let all = timeout(Duration::from_secs(8), async {
        loop {
            let all = calls(dir.path());
            if all
                .iter()
                .filter(|call| call["method"] == "session/prompt")
                .count()
                == 2
            {
                break all;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    assert_eq!(
        all.iter()
            .filter(|call| call["method"] == "initialize")
            .count(),
        1
    );
    assert_eq!(
        all.iter()
            .filter(|call| call["method"] == "session/load")
            .count(),
        1
    );
    assert!(all
        .iter()
        .all(|call| call["pid"].as_i64() == Some(pid.into())));
    let prompts: Vec<_> = all
        .iter()
        .filter(|call| call["method"] == "session/prompt")
        .collect();
    assert_eq!(prompts[1]["params"]["prompt"][0]["text"], "accepted text");
    assert!(prompts.iter().all(|call| call["params"]["prompt"]
        .as_array()
        .unwrap()
        .iter()
        .all(|block| block["type"] != "image")));
    daemon.shutdown().await;
}
