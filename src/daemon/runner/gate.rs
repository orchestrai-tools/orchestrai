use warpforge_protocol as wire;

use crate::daemon::limits::gate::MODEL_SCOPED_WINDOWS;
use crate::workflow_config::WorkflowSpec;

pub(crate) const DAY_SECS: i64 = 24 * 3600;

/// What a project's runner is already doing.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct Slots {
    /// Dispatched entries whose pull request is not open yet.
    pub in_flight: u32,
    /// Entries whose draft pull request waits for review.
    pub open_prs: u32,
    /// Items started in the last 24 hours.
    pub dispatched_today: u32,
}

/// Why the runner must not start another item now, judged from its settings
/// and what it is already doing.
/// @param settings the project's runner settings
/// @param slots what the runner holds right now
/// @returns a user-facing reason, or `None` when an item may start
pub(crate) fn slot_refusal(settings: &wire::RunnerSettings, slots: Slots) -> Option<String> {
    if !settings.running {
        return Some("The Factory is paused".to_string());
    }
    if slots.in_flight >= settings.max_concurrent {
        return Some(format!(
            "{} of {} run slot(s) in use",
            slots.in_flight, settings.max_concurrent
        ));
    }
    if slots.open_prs >= settings.max_open_prs {
        return Some(format!(
            "{} draft pull request(s) wait for review (limit {})",
            slots.open_prs, settings.max_open_prs
        ));
    }
    if slots.dispatched_today >= settings.max_per_day {
        return Some(format!(
            "{} item(s) started in the last 24 hours (limit {})",
            slots.dispatched_today, settings.max_per_day
        ));
    }
    None
}

/// Every agent a pipeline of `spec` may start, each once.
/// @param spec the workflow the item runs through
/// @param lead the lead agent, for every stage the workflow does not pin
/// @returns agent names in stage order
pub(crate) fn pipeline_agents(spec: &WorkflowSpec, lead: &str) -> Vec<String> {
    let pinned = [
        spec.plan.as_ref().and_then(|s| s.agent.clone()),
        spec.implement.agent.clone(),
        spec.fix
            .agent
            .clone()
            .or_else(|| spec.implement.agent.clone()),
    ];
    let reviewers = spec.review.reviewers.iter().map(|r| r.agent.clone());
    let mut agents: Vec<String> = Vec::new();
    let plan_runs = spec.plan.is_some();
    for (index, agent) in pinned.into_iter().enumerate() {
        if index == 0 && !plan_runs {
            continue;
        }
        push_unique(&mut agents, agent.unwrap_or_else(|| lead.to_string()));
    }
    if let Some(verify) = spec.verify.as_ref() {
        push_unique(
            &mut agents,
            verify.agent.clone().unwrap_or_else(|| lead.to_string()),
        );
    }
    for agent in reviewers {
        push_unique(&mut agents, agent.unwrap_or_else(|| lead.to_string()));
    }
    agents
}

fn push_unique(agents: &mut Vec<String>, agent: String) {
    if !agents.contains(&agent) {
        agents.push(agent);
    }
}

/// Why a new item must wait for quota headroom on `agent_id`'s active
/// account: a window that has not reset yet is above `pct` percent used.
/// A throttled or missing snapshot allows the item (ADR 0019 invariant 1).
/// @param limits the daemon's quota snapshot
/// @param agent_id registry id of the agent
/// @param now current unix time in seconds
/// @param pct the headroom threshold, in percent
/// @returns a user-facing reason, or `None` to allow the item
pub(crate) fn headroom_refusal(
    limits: &[wire::AgentAccountLimits],
    agent_id: &str,
    now: i64,
    pct: u32,
) -> Option<String> {
    let row = limits
        .iter()
        .find(|row| row.agent_id == agent_id && row.active)?;
    let window = row.windows.iter().find(|w| {
        !MODEL_SCOPED_WINDOWS.contains(&w.id.as_str())
            && w.used_percent > f64::from(pct)
            && w.resets_at.is_none_or(|at| at > now)
    })?;
    Some(format!(
        "{agent_id} account \"{}\" is at {:.0}% of its {} limit (headroom {pct}%)",
        row.label, window.used_percent, window.label
    ))
}
