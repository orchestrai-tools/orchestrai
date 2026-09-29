//! One check's result in the words both the task status and the inbox rail
//! use, whichever GitHub shape it arrived in.

use warpforge_protocol as wire;

/// A check run carries `status` and `conclusion`; a legacy status context
/// carries `state` alone, which wins when present. `CANCELLED` fails, as it
/// does in GitHub's own rollup.
pub(crate) fn check_state(
    status: Option<&str>,
    conclusion: Option<&str>,
    state: Option<&str>,
) -> wire::PullChecks {
    if let Some(state) = state.filter(|state| !state.is_empty()) {
        return match state {
            "FAILURE" | "ERROR" => wire::PullChecks::Failing,
            "PENDING" | "EXPECTED" => wire::PullChecks::Pending,
            _ => wire::PullChecks::Passing,
        };
    }
    if matches!(
        conclusion,
        Some("FAILURE" | "TIMED_OUT" | "CANCELLED" | "ACTION_REQUIRED" | "STARTUP_FAILURE")
    ) {
        return wire::PullChecks::Failing;
    }
    if status.is_some_and(|status| status != "COMPLETED") {
        return wire::PullChecks::Pending;
    }
    wire::PullChecks::Passing
}

/// Any failure wins, then anything still running; no checks is `None`.
pub(crate) fn rollup(runs: &[wire::PullCheckRun]) -> Option<wire::PullChecks> {
    if runs.is_empty() {
        return None;
    }
    let has = |state| runs.iter().any(|run| run.state == state);
    Some(if has(wire::PullChecks::Failing) {
        wire::PullChecks::Failing
    } else if has(wire::PullChecks::Pending) {
        wire::PullChecks::Pending
    } else {
        wire::PullChecks::Passing
    })
}

/// `workflow / job` when the run belongs to a workflow, else the run's own
/// name, else a status context's.
pub(crate) fn check_name(name: &str, workflow: &str, context: &str) -> String {
    let (name, workflow) = (name.trim(), workflow.trim());
    match (name.is_empty(), workflow.is_empty()) {
        (false, false) => format!("{workflow} / {name}"),
        (false, true) => name.to_string(),
        _ => context.trim().to_string(),
    }
}
