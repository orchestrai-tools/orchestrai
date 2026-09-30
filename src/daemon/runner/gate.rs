use warpforge_protocol as wire;

use crate::daemon::limits::gate::MODEL_SCOPED_WINDOWS;
use crate::workflow_config::WorkflowSpec;

pub(crate) const DAY_SECS: i64 = 24 * 3600;

/// What a project's runner is already doing.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct Slots {
    /// Dispatched entries whose pull request is not open yet, and one whose
    /// project checkout is being prepared.
    pub in_flight: u32,
    /// Entries whose draft pull request waits for review.
    pub open_prs: u32,
    /// Items started in the last 24 hours.
    pub dispatched_today: u32,
}

/// Why the Factory must not start another task now, judged from its settings
/// and what it is already doing.
/// @param settings the project's Factory settings
/// @param slots what the Factory holds right now
/// @param oldest_today when the oldest start of the last 24 hours happened
/// @returns the wait, or `None` when a task may start
pub(crate) fn slot_refusal(
    settings: &wire::RunnerSettings,
    slots: Slots,
    oldest_today: Option<i64>,
) -> Option<wire::RunnerWait> {
    if slots.in_flight >= settings.max_concurrent {
        return Some(wire::RunnerWait::Slots {
            in_use: slots.in_flight,
            limit: settings.max_concurrent,
        });
    }
    if slots.open_prs >= settings.max_open_prs {
        return Some(wire::RunnerWait::OpenPrs {
            open: slots.open_prs,
            limit: settings.max_open_prs,
        });
    }
    if slots.dispatched_today >= settings.max_per_day {
        return Some(wire::RunnerWait::Daily {
            started: slots.dispatched_today,
            limit: settings.max_per_day,
            next_at: oldest_today.map(|at| at + DAY_SECS),
        });
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

/// Why a new task must wait for quota on `agent_id`'s active account: a
/// window that has not reset yet is above `pct` percent used, or full. A
/// throttled or missing snapshot allows the task (ADR 0019 invariant 1).
/// @param limits the daemon's quota snapshot
/// @param agent_id registry id of the agent
/// @param now current unix time in seconds
/// @param pct the headroom threshold, in percent
/// @returns the wait, or `None` to allow the task
pub(crate) fn headroom_refusal(
    limits: &[wire::AgentAccountLimits],
    agent_id: &str,
    now: i64,
    pct: u32,
) -> Option<wire::RunnerWait> {
    let row = limits
        .iter()
        .find(|row| row.agent_id == agent_id && row.active)?;
    let window = row
        .windows
        .iter()
        .filter(|w| {
            !MODEL_SCOPED_WINDOWS.contains(&w.id.as_str())
                && (w.used_percent > f64::from(pct) || w.used_percent >= 100.0)
                && w.resets_at.is_none_or(|at| at > now)
        })
        .max_by_key(|w| w.resets_at.unwrap_or(i64::MAX))?;
    Some(wire::RunnerWait::Quota {
        agent: agent_id.to_string(),
        account: Some(row.label.clone()).filter(|l| !l.is_empty()),
        window: Some(window.label.clone()),
        used_pct: Some(window.used_percent.round().clamp(0.0, 999.0) as u32),
        limit_pct: Some(pct),
        resets_at: window.resets_at,
    })
}
