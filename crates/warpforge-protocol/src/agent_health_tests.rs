//! Wire-shape tests for agent install health (`AgentBrokenInstall`, the
//! `DetectedAgent.brokenInstall` field, and the `agents.healthUpdated` event).
//! Kept apart from the shared `tests.rs` rather than growing it further.

use crate::*;

/// A cached or older-daemon payload without `brokenInstall` must read as
/// healthy, not fail to parse.
#[test]
fn detected_agent_defaults_to_no_broken_install() {
    let agent: DetectedAgent = serde_json::from_value(serde_json::json!({
        "id": "codex",
        "displayName": "Codex",
        "installed": true,
        "defaultAcpCommand": "codex-acp",
        "installHint": "",
        "status": "current",
        "canManage": true,
    }))
    .unwrap();
    assert_eq!(agent.broken_install, None);
}

#[test]
fn agent_health_updated_event_roundtrip() {
    let ev = Event::AgentHealthUpdated {
        id: "codex".into(),
        broken: Some(AgentBrokenInstall {
            summary: "Missing optional dependency @openai/codex-darwin-arm64".into(),
            detail: "Codex process has exited with code 1: Missing optional dependency \
                     @openai/codex-darwin-arm64"
                .into(),
        }),
    };
    let json = serde_json::to_value(ServerMessage::Event(ev.clone())).unwrap();
    assert_eq!(json["event"], "agents.healthUpdated");
    assert_eq!(json["data"]["id"], "codex");
    assert_eq!(
        json["data"]["broken"]["summary"],
        "Missing optional dependency @openai/codex-darwin-arm64"
    );
    let back: ServerMessage = serde_json::from_value(json).unwrap();
    assert_eq!(back, ServerMessage::Event(ev));

    // Recovery is a real value on the wire (explicit null), not an omitted
    // field — otherwise a client cannot tell "cleared" from "no change sent".
    let cleared = Event::AgentHealthUpdated {
        id: "codex".into(),
        broken: None,
    };
    let json = serde_json::to_value(ServerMessage::Event(cleared.clone())).unwrap();
    assert!(json["data"]["broken"].is_null());
    let back: ServerMessage = serde_json::from_value(json).unwrap();
    assert_eq!(back, ServerMessage::Event(cleared));
}
