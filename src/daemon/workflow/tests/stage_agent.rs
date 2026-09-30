use super::*;

#[test]
fn stage_agent_fallback_chain() {
    let run = run_for(
        "name: X\nplan: {}\nimplement:\n  agent: codex\n  model: gpt-x\nreview:\n  reviewers:\n    - agent: opencode\n    - {}\n",
    );
    // plan has no override → lead agent + lead model.
    assert_eq!(
        run.stage_agent(StageKind::Plan, None),
        ("claude".into(), Some("lead-model".into()))
    );
    // implement overrides both.
    assert_eq!(
        run.stage_agent(StageKind::Implement, None),
        ("codex".into(), Some("gpt-x".into()))
    );
    // fix falls back to implement's overrides.
    assert_eq!(
        run.stage_agent(StageKind::Fix, None),
        ("codex".into(), Some("gpt-x".into()))
    );
    // reviewer 0 overrides the agent, which runs on its own default model,
    // never the lead's; reviewer 1 → lead.
    assert_eq!(
        run.stage_agent(StageKind::Review, Some(0)),
        ("opencode".into(), None)
    );
    assert_eq!(
        run.stage_agent(StageKind::Review, Some(1)),
        ("claude".into(), Some("lead-model".into()))
    );

    let run = run_for(
        "name: X\nimplement:\n  agent: claude\nfix:\n  agent: codex\nreview:\n  reviewers:\n    - agent: codex\n      model: gpt-x\n",
    );
    // Pinning the lead agent itself keeps the lead model.
    assert_eq!(
        run.stage_agent(StageKind::Implement, None),
        ("claude".into(), Some("lead-model".into()))
    );
    assert_eq!(
        run.stage_agent(StageKind::Fix, None),
        ("codex".into(), None)
    );
    assert_eq!(
        run.stage_agent(StageKind::Review, Some(0)),
        ("codex".into(), Some("gpt-x".into()))
    );
}
