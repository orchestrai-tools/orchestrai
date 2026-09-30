//! A message still waiting behind the running turn can be rewritten or dropped
//! before the agent ever sees it. Once its turn has gone out the queue entry is
//! gone, so the change is refused rather than silently lost.

use super::*;

/// Rewriting a waiting message keeps its place in line and its identity: the
/// id identifies the message, so clients do not need to guess which entry moved.
#[tokio::test]
async fn a_waiting_message_can_be_edited_in_place() {
    let dir = tempfile::tempdir().unwrap();
    let (agent, log, gate) = gated_serial_agent(dir.path());
    let daemon = Daemon::spawn(test_projects(), Store::open_at(Path::new(":memory:")).ok());
    let task = daemon
        .create_task(
            "demo",
            "PROMPT_A",
            &agent,
            vec![],
            false,
            false,
            None,
            vec![],
            None,
            HashMap::new(),
            None,
        )
        .await;

    wait_for_line(&log, "turn1:start").await;
    for text in ["PROMPT_B", "PROMPT_C"] {
        daemon.session_prompt(&task, text, vec![]).await.unwrap();
    }
    wait_for_queue(&daemon, &task, &["PROMPT_B", "PROMPT_C"]).await;

    let id = queued_entries(&daemon, &task).await[0].id.clone();
    daemon
        .session_edit_queued(&task, &id, "PROMPT_D")
        .await
        .unwrap();
    wait_for_queue(&daemon, &task, &["PROMPT_D", "PROMPT_C"]).await;

    let edited = queued_entries(&daemon, &task).await;
    assert_eq!(
        edited[0].id, id,
        "editing replaces the text, not the message's identity"
    );

    release_turn_one(&gate);
    wait_for_line(&log, "prompt:PROMPT_D").await;
    daemon.shutdown().await;
}

/// Dropping a waiting message leaves the rest in order and never reaches the
/// agent.
#[tokio::test]
async fn a_waiting_message_can_be_removed() {
    let dir = tempfile::tempdir().unwrap();
    let (agent, log, gate) = gated_serial_agent(dir.path());
    let daemon = Daemon::spawn(test_projects(), Store::open_at(Path::new(":memory:")).ok());
    let task = daemon
        .create_task(
            "demo",
            "PROMPT_A",
            &agent,
            vec![],
            false,
            false,
            None,
            vec![],
            None,
            HashMap::new(),
            None,
        )
        .await;

    wait_for_line(&log, "turn1:start").await;
    for text in ["PROMPT_B", "PROMPT_C"] {
        daemon.session_prompt(&task, text, vec![]).await.unwrap();
    }
    wait_for_queue(&daemon, &task, &["PROMPT_B", "PROMPT_C"]).await;

    let id = queued_entries(&daemon, &task).await[0].id.clone();
    daemon.session_remove_queued(&task, &id).await.unwrap();
    wait_for_queue(&daemon, &task, &["PROMPT_C"]).await;

    release_turn_one(&gate);
    wait_for_line(&log, "turn2:end").await;
    let log_text = read_log(&log);
    assert!(
        !log_text.contains("PROMPT_B"),
        "a removed message is never sent to the agent:\n{log_text}"
    );
    daemon.shutdown().await;
}

/// Once the agent has the message, the queue entry is gone and both changes are
/// refused with a reason the client can show as "already sent".
#[tokio::test]
async fn changing_a_message_that_was_already_sent_is_refused() {
    let dir = tempfile::tempdir().unwrap();
    let (agent, log, gate) = gated_serial_agent(dir.path());
    let daemon = Daemon::spawn(test_projects(), Store::open_at(Path::new(":memory:")).ok());
    let task = daemon
        .create_task(
            "demo",
            "PROMPT_A",
            &agent,
            vec![],
            false,
            false,
            None,
            vec![],
            None,
            HashMap::new(),
            None,
        )
        .await;

    wait_for_line(&log, "turn1:start").await;
    daemon
        .session_prompt(&task, "PROMPT_B", vec![])
        .await
        .unwrap();
    wait_for_queue(&daemon, &task, &["PROMPT_B"]).await;
    let id = queued_entries(&daemon, &task).await[0].id.clone();

    // Let the queued message run its own turn; its entry leaves the queue.
    release_turn_one(&gate);
    wait_for_queue(&daemon, &task, &[]).await;

    let remove_error = daemon.session_remove_queued(&task, &id).await.unwrap_err();
    assert!(
        remove_error.contains("already sent"),
        "remove refusal names the race: {remove_error}"
    );
    let edit_error = daemon
        .session_edit_queued(&task, &id, "PROMPT_D")
        .await
        .unwrap_err();
    assert!(
        edit_error.contains("already sent"),
        "edit refusal names the race: {edit_error}"
    );
    daemon.shutdown().await;
}

/// The id is what a client holds onto while a message waits, so it must not
/// change when the queue around it does — a later enqueue or another client's
/// edit renumbers nothing.
#[tokio::test]
async fn a_waiting_message_keeps_its_id_while_the_queue_changes() {
    let dir = tempfile::tempdir().unwrap();
    let (agent, log, gate) = gated_serial_agent(dir.path());
    let daemon = Daemon::spawn(test_projects(), Store::open_at(Path::new(":memory:")).ok());
    let task = daemon
        .create_task(
            "demo",
            "PROMPT_A",
            &agent,
            vec![],
            false,
            false,
            None,
            vec![],
            None,
            HashMap::new(),
            None,
        )
        .await;

    wait_for_line(&log, "turn1:start").await;
    daemon
        .session_prompt(&task, "PROMPT_B", vec![])
        .await
        .unwrap();
    wait_for_queue(&daemon, &task, &["PROMPT_B"]).await;
    let original = queued_entries(&daemon, &task).await[0].id.clone();

    daemon
        .session_prompt(&task, "PROMPT_C", vec![])
        .await
        .unwrap();
    wait_for_queue(&daemon, &task, &["PROMPT_B", "PROMPT_C"]).await;

    // Two reads of the task, as a reconnecting client would take: the entry is
    // still identified the same way.
    let read_once = queued_entries(&daemon, &task).await;
    let read_twice = queued_entries(&daemon, &task).await;
    assert_eq!(read_once[0].id, original);
    assert_eq!(read_twice[0].id, original);
    assert_ne!(
        read_once[0].id, read_once[1].id,
        "distinct messages keep distinct ids"
    );

    release_turn_one(&gate);
    daemon.shutdown().await;
}
