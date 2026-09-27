use super::*;

#[tokio::test]
async fn acp_session_streams_updates_and_permission_roundtrip() {
    use warpforge_protocol as wire;

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(test_projects(), store);
    let mut events = daemon.subscribe();

    // Agent is a raw command (not a template): our mock ACP agent.
    let mock = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-agent.mjs"
    );
    let agent = format!("node {mock}");
    let task_id = daemon
        .create_task(
            "demo",
            "fix the thing",
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
    let mut saw_agent_text = false;
    let mut saw_file_edit = false;
    let mut saw_detailed_file_edit = false;
    let mut permission_request_id: Option<String> = None;
    let mut saw_turn_ended = false;
    let mut saw_waiting = false;
    let mut waiting_files_changed = 0u32;
    let mut answered = false;

    // Drive the event stream to completion of one turn.
    for _ in 0..60 {
        let ev = match timeout(Duration::from_secs(5), events.recv()).await {
            Ok(Ok(ev)) => ev,
            _ => break,
        };
        match ev {
            Event::TaskUpdated(t) if t.id == task_id => {
                if t.status == TaskStatus::Running {
                    saw_running = true;
                }
                if t.status == TaskStatus::Waiting {
                    saw_waiting = true;
                    waiting_files_changed = t.files_changed;
                }
            }
            Event::SessionUpdate {
                task_id: tid,
                update,
            } if tid == task_id => match update {
                wire::SessionUpdate::AgentText { .. } => saw_agent_text = true,
                wire::SessionUpdate::FileEdit { path, hunks, .. } => {
                    assert_eq!(path, "src/main.rs");
                    saw_file_edit = true;
                    saw_detailed_file_edit |= !hunks.is_empty();
                }
                wire::SessionUpdate::PermissionRequest {
                    request_id,
                    options,
                    ..
                } => {
                    assert!(options.contains(&"allow".to_string()));
                    permission_request_id = Some(request_id);
                }
                wire::SessionUpdate::TurnEnded { .. } => saw_turn_ended = true,
                _ => {}
            },
            _ => {}
        }

        // Once the agent asks, answer "allow" so it can finish the turn.
        if !answered {
            if let Some(rid) = permission_request_id.clone() {
                let _ = daemon.session_permission(&task_id, &rid, "allow").await;
                answered = true;
            }
        }

        if saw_turn_ended && saw_waiting {
            break;
        }
    }

    assert!(
        saw_running,
        "task should go Running when the session starts"
    );
    assert!(saw_agent_text, "should stream agent text");
    assert!(saw_file_edit, "should report the file edit");
    assert!(
        saw_detailed_file_edit,
        "should preserve ACP diff hunks in the session stream"
    );
    assert!(
        permission_request_id.is_some(),
        "should surface a permission request"
    );
    assert!(answered, "should have answered the permission");
    assert!(
        saw_turn_ended,
        "turn should end after the permission is answered"
    );
    assert!(saw_waiting, "task should land in Waiting after the turn");
    // "There is something to review" is a fact about the diff, not a
    // separate lifecycle state — this turn edited a file, so it shows up
    // here rather than as a distinct status.
    assert!(
        waiting_files_changed > 0,
        "an editing turn should park in Waiting with changes recorded"
    );
}

/// Answers are first-writer-wins: a second answer is refused and the outcome
/// the transcript shows is the one the agent actually received.
#[tokio::test]
async fn second_permission_answer_is_refused_and_changes_nothing() {
    use crate::daemon::actor::lifecycle::PermissionAnswerError;
    use warpforge_protocol as wire;

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(test_projects(), store);
    let mut events = daemon.subscribe();

    let mock = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-agent.mjs"
    );
    let agent = format!("node {mock}");
    let task_id = daemon
        .create_task(
            "demo",
            "fix the thing",
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

    // Wait for the agent to ask.
    let request_id = timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(Event::SessionUpdate {
                task_id: tid,
                update,
            }) = events.recv().await
            {
                if tid == task_id {
                    if let wire::SessionUpdate::PermissionRequest { request_id, .. } = update {
                        return request_id;
                    }
                }
            }
        }
    })
    .await
    .expect("the agent asks for permission");

    daemon
        .session_permission(&task_id, &request_id, "allow")
        .await
        .expect("the first answer wins");

    let stale = daemon
        .session_permission(&task_id, &request_id, "deny")
        .await
        .expect_err("the second answer is refused");
    assert_eq!(
        stale,
        PermissionAnswerError::AlreadyResolved {
            outcome: Some("allow".to_string())
        }
    );

    // The persisted transcript holds exactly the winning answer.
    let history = daemon.session_history(task_id.clone()).await.unwrap();
    let resolved: Vec<String> = history
        .iter()
        .filter_map(|update| match update {
            wire::SessionUpdate::PermissionResolved {
                request_id: rid,
                outcome,
            } if rid == &request_id => Some(outcome.clone()),
            _ => None,
        })
        .collect();
    assert_eq!(resolved, vec!["allow".to_string()]);

    daemon.shutdown().await;
}

/// A prompt whose session ended can never be answered: it is recorded as
/// cancelled, so clients withdraw its buttons and banner.
#[tokio::test]
async fn cancelling_a_task_cancels_its_pending_permission() {
    use crate::daemon::actor::lifecycle::PermissionAnswerError;
    use warpforge_protocol as wire;

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(test_projects(), store);
    let mut events = daemon.subscribe();

    let mock = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-agent.mjs"
    );
    let agent = format!("node {mock}");
    let task_id = daemon
        .create_task(
            "demo",
            "fix the thing",
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

    let request_id = timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(Event::SessionUpdate {
                task_id: tid,
                update: wire::SessionUpdate::PermissionRequest { request_id, .. },
            }) = events.recv().await
            {
                if tid == task_id {
                    return request_id;
                }
            }
        }
    })
    .await
    .expect("the agent asks for permission");

    daemon.cancel_task(&task_id).await.unwrap();

    let outcome = timeout(Duration::from_secs(5), async {
        loop {
            if let Ok(Event::SessionUpdate {
                task_id: tid,
                update:
                    wire::SessionUpdate::PermissionResolved {
                        request_id: rid,
                        outcome,
                    },
            }) = events.recv().await
            {
                if tid == task_id && rid == request_id {
                    return outcome;
                }
            }
        }
    })
    .await
    .expect("the dropped request is resolved");
    assert_eq!(outcome, "cancelled");
    assert_eq!(
        daemon
            .session_permission(&task_id, &request_id, "allow")
            .await
            .unwrap_err(),
        PermissionAnswerError::AlreadyResolved { outcome: None }
    );

    daemon.shutdown().await;
}
