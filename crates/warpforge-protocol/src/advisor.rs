//! Advisor mode: a second agent a task's executor consults through the
//! `ask_advisor` MCP tool (docs/adr/0022).

use serde::{Deserialize, Serialize};

use crate::SessionUsageCost;

/// The advisor picked for a new task in `task.create`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AdvisorPick {
    /// Agent id, as for the task's own `agent`.
    pub agent: String,
    /// Model id; `None` keeps the agent's own default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

/// A task's advisor, as the task carries it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TaskAdvisor {
    pub agent: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// The advisor's hidden session task. `None` until the first question
    /// starts it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    /// Questions the advisor has answered or failed to answer.
    #[serde(default)]
    pub consultations: u32,
    /// What the advisor's answers cost, when its harness reports cost.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost: Option<SessionUsageCost>,
}

/// How a consultation ended.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AdvisorOutcome {
    Answered,
    Failed,
}

/// The reply to `advisor.ask` and `advisor.wait`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum AdvisorReply {
    Answered {
        answer: String,
        agent: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        model: Option<String>,
    },
    /// The advisor is still working; `advisor.wait` keeps waiting.
    Pending { waited_secs: u64 },
    /// Nothing was asked: no advisor, a question already pending, the turn's
    /// limit reached, or the advisor's account out of quota.
    Refused { reason: String },
    /// The advisor was asked and did not answer.
    Failed { reason: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_reply_is_tagged_by_status() {
        let pending = serde_json::to_value(AdvisorReply::Pending { waited_secs: 50 }).unwrap();
        assert_eq!(pending["status"], "pending");
        assert_eq!(pending["waited_secs"], 50);
        let answered = serde_json::to_value(AdvisorReply::Answered {
            answer: "use a lock".into(),
            agent: "codex".into(),
            model: None,
        })
        .unwrap();
        assert_eq!(answered["status"], "answered");
        assert!(answered.get("model").is_none());
    }

    #[test]
    fn a_task_advisor_reads_back_without_its_optional_fields() {
        let advisor: TaskAdvisor = serde_json::from_str(r#"{"agent":"codex"}"#).unwrap();
        assert_eq!(advisor.consultations, 0);
        assert_eq!(advisor.task_id, None);
    }
}
