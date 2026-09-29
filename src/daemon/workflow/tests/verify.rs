use super::*;

const WITH_VERIFY: &str = "name: X\nverify:\n  max_attempts: 2\n";

fn verdict(text: &str) -> VerifyReport {
    parse_verify_verdict(text, "verify (claude)").expect("parseable verdict")
}

#[test]
fn verify_verdicts_parse_with_checklist_and_findings() {
    let pass = verdict(
        "Done.\n```json\n{\"verdict\": \"pass\", \"summary\": \"works\", \"checklist\": [{\"step\": \"Open /\", \"status\": \"passed\", \"evidence\": \"shot-1.png\"}]}\n```",
    );
    assert_eq!(pass.verdict, wire::WorkflowVerifyVerdict::Pass);
    assert_eq!(pass.summary, "works");
    assert_eq!(pass.checklist[0].status, wire::WorkflowCheckStatus::Pass);
    assert_eq!(pass.checklist[0].evidence, vec!["shot-1.png"]);
    assert!(pass.findings.is_empty());

    let fail = verdict(
        "```json\n{\"verdict\": \"fail\", \"checklist\": [], \"findings\": [{\"severity\": \"high\", \"description\": \"save is lost\"}]}\n```",
    );
    assert_eq!(fail.verdict, wire::WorkflowVerifyVerdict::Fail);
    assert_eq!(fail.findings[0].description, "save is lost");
    assert_eq!(fail.findings[0].reviewer, "verify (claude)");

    let blocked = verdict("No app is running.\n```json\n{\"verdict\": \"blocked\"}\n```");
    assert_eq!(blocked.verdict, wire::WorkflowVerifyVerdict::Blocked);
    assert_eq!(blocked.summary, "No app is running.");

    // The review vocabulary is understood too: agents reuse what they know.
    assert_eq!(
        verdict("```json\n{\"verdict\": \"approve\"}\n```").verdict,
        wire::WorkflowVerifyVerdict::Pass
    );
}

#[test]
fn a_failure_always_carries_findings_and_a_failed_step_is_never_a_pass() {
    let from_steps = verdict(
        "```json\n{\"verdict\": \"pass\", \"checklist\": [{\"step\": \"Log in\", \"status\": \"fail\", \"note\": \"500 error\"}, {\"step\": \"Open\", \"status\": \"pass\"}]}\n```",
    );
    assert_eq!(from_steps.verdict, wire::WorkflowVerifyVerdict::Fail);
    assert_eq!(from_steps.findings.len(), 1);
    assert_eq!(
        from_steps.findings[0].description,
        "Step failed: Log in — 500 error"
    );
    assert_eq!(from_steps.findings[0].severity, Severity::High);

    let from_prose = verdict("The button does nothing.\n```json\n{\"verdict\": \"fail\"}\n```");
    assert_eq!(from_prose.findings.len(), 1);
    assert!(from_prose.findings[0]
        .description
        .contains("button does nothing"));
}

#[test]
fn unparseable_verify_replies_are_errors() {
    assert!(parse_verify_verdict("looks fine", "v").is_err());
    let err = parse_verify_verdict("```json\n{\"verdict\": \"maybe\"}\n```", "v").unwrap_err();
    assert!(err.contains("\"pass\", \"fail\" or \"blocked\""), "{err}");
    assert!(reask_verify_prompt("x").contains("\"blocked\""));
}

#[test]
fn verify_sits_after_implement_and_after_each_fix_that_needs_it() {
    let plain = run_for("name: X\n");
    assert_eq!(
        plain.stage_after(StageKind::Implement, true),
        StageKind::Review
    );
    assert_eq!(plain.stage_after(StageKind::Fix, true), StageKind::Review);
    assert_eq!(
        plain.stage_after(StageKind::Plan, true),
        StageKind::Implement
    );

    let mut run = run_for(WITH_VERIFY);
    assert_eq!(
        run.stage_after(StageKind::Implement, false),
        StageKind::Verify
    );
    // A fix after a review is checked again only when it changed the code.
    assert_eq!(run.stage_after(StageKind::Fix, true), StageKind::Verify);
    assert_eq!(run.stage_after(StageKind::Fix, false), StageKind::Review);
    // A fix after a failed verification is always checked again.
    run.findings_source = FindingsSource::Verify;
    assert_eq!(run.stage_after(StageKind::Fix, false), StageKind::Verify);
}

#[test]
fn verify_routing_respects_attempts_and_required() {
    use wire::WorkflowVerifyVerdict::*;
    let mut run = run_for(WITH_VERIFY);
    assert_eq!(run.route_verify(Pass), VerifyRoute::Review);
    run.verify_failures = 1;
    assert_eq!(run.route_verify(Fail), VerifyRoute::Fix);
    run.verify_failures = 2;
    assert_eq!(run.route_verify(Fail), VerifyRoute::Ask);
    assert_eq!(run.route_verify(Blocked), VerifyRoute::Ask);
    run.verify_extra = 1;
    assert_eq!(run.verify_limit(), 3);
    assert_eq!(run.route_verify(Fail), VerifyRoute::Fix);

    let mut optional = run_for("name: X\nverify:\n  required: false\n  max_attempts: 1\n");
    optional.verify_failures = 1;
    assert_eq!(optional.route_verify(Fail), VerifyRoute::Skip);
    assert_eq!(optional.route_verify(Blocked), VerifyRoute::Skip);
}

#[test]
fn a_verify_barrier_is_a_limit_wait_on_the_verify_stage() {
    let mut run = run_for(WITH_VERIFY);
    run.verify_failures = 2;
    run.verify_findings = vec![Finding {
        severity: Severity::High,
        file: None,
        line: None,
        snippet: None,
        description: "d".into(),
        reviewer: "verify".into(),
    }];
    run.state = RunState::AwaitingVerifyDecision {
        barrier_id: "b_9".into(),
        blocked: false,
    };
    let info = run.wire_info();
    assert_eq!(info.stage, wire::WorkflowStage::Verify);
    let waiting = info.waiting.unwrap();
    assert_eq!(waiting.kind, wire::WorkflowWaitKind::Limit);
    assert_eq!(waiting.stage, Some(wire::WorkflowStage::Verify));
    assert_eq!(waiting.barrier_id.as_deref(), Some("b_9"));
    assert!(waiting.question.unwrap().contains("failed 2 time(s)"));

    run.verifications.push(wire::WorkflowVerification {
        task_id: None,
        attempt: 1,
        verdict: Some(wire::WorkflowVerifyVerdict::Blocked),
        summary: "no desktop app".into(),
        checklist: vec![],
        evidence: vec![],
    });
    run.state = RunState::AwaitingVerifyDecision {
        barrier_id: "b_10".into(),
        blocked: true,
    };
    let question = run.wire_info().waiting.unwrap().question.unwrap();
    assert_eq!(question, "verification could not run: no desktop app");
}

#[test]
fn verify_prompt_carries_the_plan_the_tools_and_the_protocol() {
    let run = run_for("name: X\nverify:\n  instructions: Sign in as demo.\n");
    let ctx = PromptCtx {
        task_prompt: "Let users rename a project".into(),
        implementer_summary: Some("added a rename dialog".into()),
        guidance: Some("the seed user is demo".into()),
        ..Default::default()
    };
    let verify = VerifyCtx {
        attempt: 2,
        max_attempts: 2,
        changed_files: Some("- src/rename.tsx".into()),
        previous: Some("**Verification: FAIL** (attempt 1)".into()),
    };
    let prompt = build_verify_prompt(&run.spec, &ctx, &verify);
    for needle in [
        "attempt 2/2",
        "Let users rename a project",
        "added a rename dialog",
        "- src/rename.tsx",
        "Sign in as demo.",
        "re-check every failure",
        "list_runtime",
        "service_start",
        "browser_navigate",
        "browser_screenshot",
        "browser_console",
        "User guidance",
        "\"verdict\": \"fail\"",
        "Do NOT edit source files",
    ] {
        assert!(prompt.contains(needle), "missing {needle:?}");
    }
    assert!(!prompt.contains("need_user_input"));
}

#[test]
fn a_fix_after_verification_says_where_its_findings_came_from() {
    let run = run_for(WITH_VERIFY);
    let ctx = PromptCtx {
        findings: Some("1. [high] — save is lost (verify (claude))".into()),
        verify_findings: true,
        ..Default::default()
    };
    let prompt = build_fix_prompt(&run.spec, &ctx);
    assert!(prompt.contains("QA verification stage"));
    assert!(!prompt.contains("Reviewers found"));
    assert!(prompt.contains("save is lost"));
}

#[test]
fn the_final_report_flags_a_change_that_did_not_pass() {
    let mut run = run_for(WITH_VERIFY);
    assert!(run.verification_section().is_none());
    run.verifications.push(wire::WorkflowVerification {
        task_id: Some("t_v".into()),
        attempt: 1,
        verdict: Some(wire::WorkflowVerifyVerdict::Pass),
        summary: "rename works".into(),
        checklist: vec![wire::WorkflowCheckItem {
            step: "Rename a project".into(),
            status: wire::WorkflowCheckStatus::Pass,
            note: None,
            evidence: vec!["shot-1.png".into()],
        }],
        evidence: vec![wire::WorkflowEvidence {
            name: "shot-1.png".into(),
            path: "/evidence/t_parent/shot-1.png".into(),
            mime_type: "image/png".into(),
        }],
    });
    let passed = run.verification_section().unwrap();
    assert!(
        passed.starts_with("**Verification: PASS** (attempt 1)"),
        "{passed}"
    );
    assert!(passed.contains("- **PASS** Rename a project (shot-1.png)"));
    assert!(passed.contains("Screenshots are stored in `/evidence/t_parent`"));

    run.verifications[0].verdict = Some(wire::WorkflowVerifyVerdict::Blocked);
    assert!(run
        .verification_section()
        .unwrap()
        .starts_with("⚠ The change did not pass verification"));
}

#[test]
fn a_run_snapshot_from_before_verify_still_loads() {
    let run = run_for("name: X\n");
    let mut json = serde_json::to_value(&run).unwrap();
    let object = json.as_object_mut().unwrap();
    for key in [
        "verify_failures",
        "verify_extra",
        "verify_findings",
        "findings_source",
        "fix_base",
        "verifications",
        "report",
    ] {
        assert!(object.remove(key).is_some(), "{key}");
    }
    let restored: WorkflowRun = serde_json::from_value(json).unwrap();
    assert_eq!(restored.findings_source, FindingsSource::Review);
    assert!(restored.verifications.is_empty());

    let mut parked = run_for(WITH_VERIFY);
    parked.state = RunState::AwaitingVerifyDecision {
        barrier_id: "b".into(),
        blocked: true,
    };
    parked.fix_base = Some(7);
    let back: WorkflowRun = serde_json::from_str(&serde_json::to_string(&parked).unwrap()).unwrap();
    assert_eq!(back.state, parked.state);
    assert_eq!(back.fix_base, Some(7));
}
