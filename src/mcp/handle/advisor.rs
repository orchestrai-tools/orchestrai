use std::time::Duration;

use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use crate::mcp::daemon_client::DaemonClient;

/// Longer than the daemon's longest wait (its fifteen-minute deadline).
const ADVISOR_TIMEOUT: Duration = Duration::from_secs(16 * 60);

/// Run `ask_advisor`: a new question, or `wait` for the pending one.
/// @param client the daemon connection
/// @param task the executor's task
/// @param args the tool arguments
/// @returns the text the executor reads
pub(crate) async fn ask_advisor(
    client: &mut DaemonClient,
    task: &str,
    args: &Value,
) -> Result<String> {
    let wait = args.get("wait").and_then(Value::as_bool).unwrap_or(false);
    let question = args
        .get("question")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|question| !question.is_empty());
    let (method, params) = match (wait, question) {
        (true, _) => ("advisor.wait", json!({ "task_id": task })),
        (false, Some(question)) => (
            "advisor.ask",
            json!({
                "task_id": task,
                "question": question,
                "context": args.get("context").and_then(Value::as_str),
            }),
        ),
        (false, None) => return Err(anyhow!("'question' is required unless wait is true")),
    };
    let reply = client
        .request_within(method, params, ADVISOR_TIMEOUT)
        .await?;
    Ok(render(&reply))
}

fn render(reply: &Value) -> String {
    let field = |key: &str| reply.get(key).and_then(Value::as_str).unwrap_or("");
    match field("status") {
        "answered" => {
            let who = match reply.get("model").and_then(Value::as_str) {
                Some(model) => format!("{} · {model}", field("agent")),
                None => field("agent").to_string(),
            };
            format!("Advisor ({who}) answered:\n\n{}", field("answer"))
        }
        "pending" => format!(
            "The advisor is still working on your question (waited {}s). Call ask_advisor \
             again with wait: true to keep waiting — do not ask it again.",
            reply
                .get("waited_secs")
                .and_then(Value::as_u64)
                .unwrap_or(0)
        ),
        "refused" => format!("Not asked: {}", field("reason")),
        "failed" => format!(
            "The advisor did not answer: {}. Carry on without it.",
            field("reason")
        ),
        _ => format!("Unexpected advisor reply: {reply}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_reply_reads_as_an_instruction() {
        let answered = render(&json!({
            "status": "answered", "answer": "Use a mutex.", "agent": "codex", "model": "gpt-5"
        }));
        assert!(answered.starts_with("Advisor (codex · gpt-5) answered:"));
        assert!(answered.ends_with("Use a mutex."));
        let pending = render(&json!({ "status": "pending", "waited_secs": 50 }));
        assert!(pending.contains("wait: true"));
        let refused = render(&json!({ "status": "refused", "reason": "no advisor" }));
        assert_eq!(refused, "Not asked: no advisor");
    }
}
