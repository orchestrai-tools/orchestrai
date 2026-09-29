use super::*;

#[test]
fn a_user_pause_reports_its_reason_and_no_detail() {
    let mut run = run_for("name: X\n");
    run.state = RunState::Paused {
        next: StageKind::Fix,
        reason: wire::WorkflowPauseReason::User,
        detail: String::new(),
    };
    let info = run.wire_info();
    assert_eq!(info.stage, wire::WorkflowStage::Fix);
    let waiting = info.waiting.unwrap();
    assert_eq!(waiting.kind, wire::WorkflowWaitKind::Paused);
    assert_eq!(waiting.pause_reason, Some(wire::WorkflowPauseReason::User));
    assert_eq!(waiting.question, None);
}

#[test]
fn a_daemon_park_carries_why_it_parked() {
    let mut run = run_for("name: X\n");
    run.state = RunState::Paused {
        next: StageKind::Implement,
        reason: wire::WorkflowPauseReason::Quota,
        detail: "claude account \"work\" is out of quota until 14:00".into(),
    };
    let waiting = run.wire_info().waiting.unwrap();
    assert_eq!(waiting.pause_reason, Some(wire::WorkflowPauseReason::Quota));
    assert_eq!(
        waiting.question.as_deref(),
        Some("claude account \"work\" is out of quota until 14:00")
    );
}

#[test]
fn a_pause_saved_before_reasons_existed_loads_as_a_user_pause() {
    let state: RunState = serde_json::from_str(r#"{"state":"paused","next":"review"}"#).unwrap();
    assert_eq!(
        state,
        RunState::Paused {
            next: StageKind::Review,
            reason: wire::WorkflowPauseReason::User,
            detail: String::new(),
        }
    );
}

#[test]
fn only_a_paused_barrier_names_a_pause_reason() {
    let mut run = run_for("name: X\n");
    run.state = RunState::AwaitingLimitDecision {
        barrier_id: "b_1".into(),
    };
    assert_eq!(run.wire_info().waiting.unwrap().pause_reason, None);
}
