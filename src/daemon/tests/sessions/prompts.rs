use super::*;

#[tokio::test]
async fn no_edit_turn_lands_in_waiting_with_no_changes() {
    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(test_projects(), store);
    let mut events = daemon.subscribe();

    let mock = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-agent-noedit.mjs"
    );
    let agent = format!("node {mock}");
    let task_id = daemon
        .create_task(
            "demo",
            "what port is the api on?",
            &agent,
            vec![],
            false,
            false,
            None,
            vec![],
            None,
            std::collections::HashMap::new(),
            None,
        )
        .await;

    let mut saw_running = false;
    let mut final_status: Option<TaskStatus> = None;
    let mut final_files_changed = 0u32;
    for _ in 0..60 {
        let ev = match timeout(Duration::from_secs(5), events.recv()).await {
            Ok(Ok(ev)) => ev,
            _ => break,
        };
        if let Event::TaskUpdated(t) = ev {
            if t.id == task_id {
                if t.status == TaskStatus::Running {
                    saw_running = true;
                }
                // The turn settles into a non-running, non-queued status.
                if matches!(t.status, TaskStatus::Waiting | TaskStatus::Blocked) {
                    final_files_changed = t.files_changed;
                    final_status = Some(t.status.clone());
                    break;
                }
            }
        }
    }

    assert!(saw_running, "task should go Running during the turn");
    assert_eq!(
        final_status,
        Some(TaskStatus::Waiting),
        "a finished turn parks in Waiting whether or not it edited anything"
    );
    assert_eq!(
        final_files_changed, 0,
        "a pure Q&A turn has nothing to review, and that is a field, not a status"
    );
}

#[tokio::test]
async fn acp_prompt_blocks_follow_capabilities_and_support_followups() {
    use warpforge_protocol::PromptAttachment;
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("note.txt"), "attached text").unwrap();
    let projects = vec![ProjectEntry {
        name: "demo".into(),
        path: dir.path().to_string_lossy().into(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }];
    let daemon = Daemon::spawn(
        projects,
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let mut events = daemon.subscribe();
    let fixture = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-inspect.mjs"
    );
    let task_id = daemon
        .create_task(
            "demo",
            "inspect",
            &format!("node {fixture} true true"),
            vec![],
            false,
            false,
            None,
            vec![
                PromptAttachment::File {
                    path: "note.txt".into(),
                    range: None,
                },
                PromptAttachment::Image {
                    name: "tiny.png".into(),
                    mime_type: "image/png".into(),
                    data: "iVBORw0KGgpyZXN0".into(),
                },
                PromptAttachment::Document {
                    name: "spec.md".into(),
                    mime_type: "text/markdown".into(),
                    text: "# spec".into(),
                },
            ],
            None,
            std::collections::HashMap::new(),
            None,
        )
        .await;
    let mut initial = false;
    for _ in 0..20 {
        if let Ok(Ok(Event::SessionUpdate {
            task_id: id,
            update: warpforge_protocol::SessionUpdate::AgentText { text },
        })) = timeout(Duration::from_secs(2), events.recv()).await
        {
            if id == task_id && text == "blocks:text,resource,image,resource" {
                initial = true;
                break;
            }
        }
    }
    assert!(
        initial,
        "initial prompt should use resource, image and document blocks"
    );
    daemon
        .session_prompt(
            &task_id,
            "follow up",
            vec![
                PromptAttachment::File {
                    path: "note.txt".into(),
                    range: None,
                },
                PromptAttachment::Document {
                    name: "spec.md".into(),
                    mime_type: "text/markdown".into(),
                    text: "# spec".into(),
                },
            ],
        )
        .await
        .unwrap();
    let mut followup = false;
    for _ in 0..20 {
        if let Ok(Ok(Event::SessionUpdate {
            task_id: id,
            update: warpforge_protocol::SessionUpdate::AgentText { text },
        })) = timeout(Duration::from_secs(2), events.recv()).await
        {
            if id == task_id && text == "blocks:text,resource,resource" {
                followup = true;
                break;
            }
        }
    }
    assert!(followup, "follow-up attachments should reach ACP");
}

#[tokio::test]
async fn acp_resource_falls_back_to_text_and_unsupported_images_block() {
    use warpforge_protocol::PromptAttachment;
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("note.txt"), "attached text").unwrap();
    let projects = vec![ProjectEntry {
        name: "demo".into(),
        path: dir.path().to_string_lossy().into(),
        added_at: "0".into(),
        port_range: None,
        port_range_override: None,
    }];
    let fixture = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-inspect.mjs"
    );

    let daemon = Daemon::spawn(
        projects.clone(),
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let mut events = daemon.subscribe();
    let id = daemon
        .create_task(
            "demo",
            "inspect",
            &format!("node {fixture} true false"),
            vec![],
            false,
            false,
            None,
            vec![
                PromptAttachment::File {
                    path: "note.txt".into(),
                    range: None,
                },
                PromptAttachment::Document {
                    name: "spec.md".into(),
                    mime_type: "text/markdown".into(),
                    text: "# spec".into(),
                },
            ],
            None,
            std::collections::HashMap::new(),
            None,
        )
        .await;
    let mut fallback = false;
    for _ in 0..20 {
        if let Ok(Ok(Event::SessionUpdate {
            task_id,
            update: warpforge_protocol::SessionUpdate::AgentText { text },
        })) = timeout(Duration::from_secs(2), events.recv()).await
        {
            if task_id == id && text == "blocks:text,text,text" {
                fallback = true;
                break;
            }
        }
    }
    assert!(
        fallback,
        "resources and documents should fall back to delimited text"
    );

    let daemon = Daemon::spawn(
        projects,
        Store::open_at(std::path::Path::new(":memory:")).ok(),
    );
    let mut events = daemon.subscribe();
    let id = daemon
        .create_task(
            "demo",
            "inspect",
            &format!("node {fixture} false true"),
            vec![],
            false,
            false,
            None,
            vec![PromptAttachment::Image {
                name: "tiny.png".into(),
                mime_type: "image/png".into(),
                data: "iVBORw0KGgpyZXN0".into(),
            }],
            None,
            std::collections::HashMap::new(),
            None,
        )
        .await;
    let mut blocked = false;
    for _ in 0..20 {
        if let Ok(Ok(Event::TaskUpdated(task))) =
            timeout(Duration::from_secs(2), events.recv()).await
        {
            if task.id == id && task.status == TaskStatus::Blocked {
                blocked = true;
                break;
            }
        }
    }
    assert!(blocked, "unsupported images must be rejected by the daemon");
    assert!(daemon
        .session_prompt("missing", "not delivered", vec![])
        .await
        .is_err());
}
