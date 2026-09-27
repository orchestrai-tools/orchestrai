use super::*;

/// Enabling an agent with no cached models probes it with `reply: None`.
#[tokio::test]
async fn a_background_probe_marks_a_broken_install_and_a_healthy_one_clears_it() {
    use warpforge_protocol as wire;

    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(test_projects(), store);
    let mut events = daemon.subscribe();

    let config = |acp_command: String| wire::AgentConfig {
        id: "mock-agent".into(),
        display_name: "Mock Agent".into(),
        acp_command,
        enabled: true,
        models: vec![],
        last_model: None,
    };

    let broken_mock = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-reject-init.mjs"
    );
    daemon
        .update_agents(vec![config(format!("node {broken_mock}"))])
        .await;

    let broken = timeout(Duration::from_secs(10), async {
        loop {
            if let Ok(Event::AgentHealthUpdated { id, broken }) = events.recv().await {
                if id == "mock-agent" {
                    break broken;
                }
            }
        }
    })
    .await
    .expect("a background probe with a broken-install signature should mark the agent")
    .expect("expected the agent to be marked broken, not cleared");
    assert!(broken.summary.contains("Missing optional dependency"));

    // Re-point at a fixture that completes the handshake; enabling it again
    // re-probes (still no cached models) and must clear the earlier mark.
    let healthy_mock = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-inspect.mjs"
    );
    daemon
        .update_agents(vec![config(format!("node {healthy_mock}"))])
        .await;

    let cleared = timeout(Duration::from_secs(10), async {
        loop {
            if let Ok(Event::AgentHealthUpdated { id, broken }) = events.recv().await {
                if id == "mock-agent" {
                    break broken;
                }
            }
        }
    })
    .await
    .expect("a successful probe should clear the earlier mark");
    assert!(cleared.is_none());
}

/// A session start that fails with a broken-install signature (the agent's
/// own process reports a missing native binary or module) must mark the
/// agent's tracked health, exactly like a failed background probe does.
#[tokio::test]
async fn a_session_start_failure_with_a_broken_install_signature_marks_the_agent() {
    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(test_projects(), store);
    let mut events = daemon.subscribe();

    let mock = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-reject-init.mjs"
    );
    let agent = format!("node {mock}");
    daemon
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

    let broken = timeout(Duration::from_secs(10), async {
        loop {
            if let Ok(Event::AgentHealthUpdated { id, broken }) = events.recv().await {
                if id == agent {
                    break broken;
                }
            }
        }
    })
    .await
    .expect("a session start with a broken-install signature should mark the agent")
    .expect("expected the agent to be marked broken, not cleared");
    assert!(broken.summary.contains("Missing optional dependency"));
}

/// A session start that fails for an unrelated reason (here: an auth error —
/// the same non-signature the install-verification classifier already
/// ignores) must not be mistaken for a broken install.
#[tokio::test]
async fn a_session_start_auth_failure_does_not_mark_the_agent_broken() {
    let store = Store::open_at(std::path::Path::new(":memory:")).ok();
    let daemon = Daemon::spawn(test_projects(), store);
    let mut events = daemon.subscribe();

    let mock = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/tests/fixtures/mock-acp-reject-init.mjs"
    );
    let agent = format!("node {mock} 'Authentication required' -32000");
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

    // Wait for the task to actually block — proving the session-start path
    // ran to completion — before checking that no health event followed it.
    let blocked = timeout(Duration::from_secs(10), async {
        loop {
            if let Ok(Event::TaskUpdated(task)) = events.recv().await {
                if task.id == task_id && task.status == TaskStatus::Blocked {
                    break task;
                }
            }
        }
    })
    .await
    .expect("an initialize rejection should still block the task");
    assert!(blocked
        .blocked_reason
        .unwrap_or_default()
        .contains("Authentication required"));

    let saw_health = timeout(Duration::from_millis(500), async {
        loop {
            if let Ok(Event::AgentHealthUpdated { id, .. }) = events.recv().await {
                if id == agent {
                    return true;
                }
            }
        }
    })
    .await
    .unwrap_or(false);
    assert!(
        !saw_health,
        "an auth failure must not be classified as a broken install"
    );
}
