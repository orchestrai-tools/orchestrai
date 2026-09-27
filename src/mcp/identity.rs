//! Which session a bridge serves. The daemon's `WARPFORGE_SESSION_*` variables
//! outrank an entry's `WF_*`: the agent may have started a same-named entry
//! from its own config (ADR 0018).

use anyhow::{anyhow, Result};

pub(crate) const SESSION_TASK: &str = "WARPFORGE_SESSION_TASK";
pub(crate) const SESSION_PROJECT: &str = "WARPFORGE_SESSION_PROJECT";
pub(crate) const SESSION_MODE: &str = "WARPFORGE_SESSION_MODE";

/// Set when Claude Code's Remote Control spawner starts a child. A Claude
/// Code that inherits it drops every stdio server passed over ACP.
pub(crate) const REMOTE_CONTROL_CARRIER: &str = "CLAUDE_CODE_BRIDGE_MCP_CARRIER";

/// Drop the session identity a daemon inherits when it is started from inside
/// an agent session, before it spawns anything that would pass it on.
pub(crate) fn forget_inherited_session() {
    for name in [
        SESSION_TASK,
        SESSION_PROJECT,
        SESSION_MODE,
        REMOTE_CONTROL_CARRIER,
    ] {
        std::env::remove_var(name);
    }
}

#[derive(Debug, PartialEq)]
pub(crate) struct Identity {
    /// The inbox owner and parent of spawned sub-agents.
    pub(crate) parent_task: String,
    /// `None` leaves the project to the working directory.
    pub(crate) project: Option<String>,
    pub(crate) is_orchestrator: bool,
    /// Whether the identity came from the launching session.
    pub(crate) from_session: bool,
}

/// Resolve the identity from environment variables.
/// @param var reads one variable; `None` when it is unset
/// @returns the identity, or an error for an orchestrator without a task
pub(crate) fn resolve(var: impl Fn(&str) -> Option<String>) -> Result<Identity> {
    let non_empty = |name: &str| var(name).filter(|value| !value.trim().is_empty());
    if let Some(task) = non_empty(SESSION_TASK) {
        return Ok(Identity {
            parent_task: task,
            project: non_empty(SESSION_PROJECT),
            is_orchestrator: var(SESSION_MODE).as_deref() == Some("orchestrator"),
            from_session: true,
        });
    }
    // A legacy daemon sets `WF_ORCH_TASK` but not `WF_MODE`; treat that as an
    // orchestrator session so the old env still yields the orchestrator tools.
    let mode = var("WF_MODE");
    let is_orchestrator = mode.as_deref() == Some("orchestrator")
        || (mode.is_none() && var("WF_ORCH_TASK").is_some());
    let parent_task = var("WF_TASK").or_else(|| var("WF_ORCH_TASK"));
    if is_orchestrator && parent_task.is_none() {
        return Err(anyhow!(
            "WF_TASK not set — an orchestrator bridge is spawned by the daemon"
        ));
    }
    Ok(Identity {
        parent_task: parent_task.unwrap_or_default(),
        project: var("WF_PROJECT")
            .or_else(|| var("WF_ORCH_PROJECT"))
            .filter(|project| !project.trim().is_empty()),
        is_orchestrator,
        from_session: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn resolve_from(vars: &[(&str, &str)]) -> Result<Identity> {
        resolve(|name| {
            vars.iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| value.to_string())
        })
    }

    #[test]
    fn the_session_outranks_a_same_named_entry_from_the_agents_own_config() {
        let identity = resolve_from(&[
            ("WF_TASK", "policy-probe"),
            ("WF_PROJECT", "warpforge"),
            ("WF_MODE", "single"),
            (SESSION_TASK, "t_orch"),
            (SESSION_PROJECT, "demo"),
            (SESSION_MODE, "orchestrator"),
        ])
        .unwrap();
        assert_eq!(
            identity,
            Identity {
                parent_task: "t_orch".into(),
                project: Some("demo".into()),
                is_orchestrator: true,
                from_session: true,
            }
        );
    }

    #[test]
    fn a_single_session_stays_single_whatever_the_entry_says() {
        let identity = resolve_from(&[
            ("WF_MODE", "orchestrator"),
            ("WF_TASK", "t_other"),
            (SESSION_TASK, "t_child"),
            (SESSION_MODE, "single"),
        ])
        .unwrap();
        assert_eq!(identity.parent_task, "t_child");
        assert!(!identity.is_orchestrator);
        assert_eq!(identity.project, None);
    }

    #[test]
    fn outside_a_session_the_entry_decides() {
        let identity = resolve_from(&[("WF_TASK", "t_1"), ("WF_MODE", "orchestrator")]).unwrap();
        assert!(identity.is_orchestrator && !identity.from_session);
        assert_eq!(identity.parent_task, "t_1");

        let legacy = resolve_from(&[("WF_ORCH_TASK", "t_2"), ("WF_ORCH_PROJECT", "p")]).unwrap();
        assert!(legacy.is_orchestrator);
        assert_eq!(legacy.project.as_deref(), Some("p"));

        let global = resolve_from(&[]).unwrap();
        assert!(!global.is_orchestrator);
        assert_eq!(global.project, None);
    }

    #[test]
    fn an_orchestrator_needs_a_task() {
        assert!(resolve_from(&[("WF_MODE", "orchestrator")]).is_err());
    }
}
