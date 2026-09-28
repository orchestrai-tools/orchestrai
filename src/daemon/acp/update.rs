use std::collections::HashMap;

use serde_json::Value;
use warpforge_protocol as wire;

use super::edits::edit_info;
use super::model::parse_config_options;
use super::tool::{content_text, tool_details, tool_title};
use super::AcpUpdate;

/// The last `kind` and `status` per `toolCallId`: ACP updates may omit both.
/// opencode's edit diff arrives on a frame without `kind`; Claude's compaction
/// sends its token counts after `completed` on a frame without `status`.
#[derive(Default)]
pub(super) struct ToolCalls(HashMap<String, (String, String)>);

impl ToolCalls {
    fn resolve(&mut self, id: &str, kind: Option<&str>, status: Option<&str>) -> (String, String) {
        let known = self.0.get(id);
        let kind = kind
            .map(String::from)
            .or_else(|| known.map(|(kind, _)| kind.clone()))
            .unwrap_or_else(|| "other".to_string());
        let status = status
            .map(String::from)
            .or_else(|| known.map(|(_, status)| status.clone()))
            .unwrap_or_else(|| "in_progress".to_string());
        if !id.is_empty() {
            self.0
                .insert(id.to_string(), (kind.clone(), status.clone()));
        }
        (kind, status)
    }
}

pub(super) fn parse_update(params: &Value, tool_calls: &mut ToolCalls) -> Option<AcpUpdate> {
    let update = params.get("update")?;
    let kind = update.get("sessionUpdate")?.as_str()?;
    match kind {
        "agent_message_chunk" => Some(AcpUpdate::AgentText(content_text(update.get("content")?)?)),
        "agent_thought_chunk" => Some(AcpUpdate::AgentThought(content_text(
            update.get("content")?,
        )?)),
        "tool_call" | "tool_call_update" => {
            let id = update
                .get("toolCallId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let (kind, status) = tool_calls.resolve(
                &id,
                update.get("kind").and_then(|v| v.as_str()),
                update.get("status").and_then(|v| v.as_str()),
            );
            // A file edit still emits a dedicated FileEdit for the diff badge…
            if kind == "edit" {
                if let Some(edit) = edit_info(update) {
                    return Some(AcpUpdate::FileEdit {
                        path: edit.path,
                        tool_call_id: id,
                        additions: edit.additions,
                        deletions: edit.deletions,
                        hunks: edit.hunks,
                    });
                }
            }
            let title = tool_title(update, &id, &kind);
            Some(AcpUpdate::ToolCall {
                id,
                title,
                status,
                kind,
                content: tool_details(update),
            })
        }
        "plan" => {
            let entries = update
                .get("entries")?
                .as_array()?
                .iter()
                .map(|e| wire::PlanEntry {
                    content: e
                        .get("content")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    status: e
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("pending")
                        .to_string(),
                    priority: e.get("priority").and_then(|v| v.as_str()).map(String::from),
                })
                .collect();
            Some(AcpUpdate::Plan { entries })
        }
        "available_commands_update" => {
            let commands = update
                .get("availableCommands")?
                .as_array()?
                .iter()
                .map(|c| wire::CommandInfo {
                    name: c
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                    description: c
                        .get("description")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string(),
                })
                .collect();
            Some(AcpUpdate::AvailableCommands { commands })
        }
        "config_option_update" => Some(AcpUpdate::ConfigOptions {
            options: parse_config_options(update.get("configOptions")),
        }),
        "usage_update" => {
            let used = update.get("used")?.as_u64()?;
            let size = update.get("size")?.as_u64()?;
            let cost = update.get("cost").and_then(|value| {
                Some(wire::SessionUsageCost {
                    amount: value.get("amount")?.as_f64()?,
                    currency: value.get("currency")?.as_str()?.to_string(),
                })
            });
            Some(AcpUpdate::Usage { used, size, cost })
        }
        _ => None, // user_message_chunk (our own echo), current_mode_update, etc.
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn tool_status(frame: Value, calls: &mut ToolCalls) -> (String, String) {
        match parse_update(&json!({ "update": frame }), calls) {
            Some(AcpUpdate::ToolCall { status, kind, .. }) => (status, kind),
            _ => panic!("expected tool call"),
        }
    }

    #[test]
    fn compaction_token_counts_after_completion_keep_it_completed() {
        let mut calls = ToolCalls::default();
        let id = "01d396b3-15f9-4969-a370-39160f1708e4";
        tool_status(
            json!({
                "sessionUpdate": "tool_call",
                "toolCallId": id,
                "title": "Compact conversation",
                "kind": "think",
                "status": "in_progress"
            }),
            &mut calls,
        );
        tool_status(
            json!({ "sessionUpdate": "tool_call_update", "toolCallId": id, "status": "completed" }),
            &mut calls,
        );
        let (status, kind) = tool_status(
            json!({
                "sessionUpdate": "tool_call_update",
                "toolCallId": id,
                "rawOutput": { "preTokens": 831504, "postTokens": 14907, "trigger": "manual" }
            }),
            &mut calls,
        );
        assert_eq!((status.as_str(), kind.as_str()), ("completed", "think"));
    }

    #[test]
    fn statusless_frame_of_an_unseen_call_is_in_progress() {
        let (status, kind) = tool_status(
            json!({ "sessionUpdate": "tool_call_update", "toolCallId": "unseen" }),
            &mut ToolCalls::default(),
        );
        assert_eq!((status.as_str(), kind.as_str()), ("in_progress", "other"));
    }
}
