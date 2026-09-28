use std::panic::AssertUnwindSafe;

use anyhow::Result;
use futures::FutureExt;
use serde_json::{json, Value};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWrite, AsyncWriteExt};

use super::daemon_client::DaemonClient;
use super::{browser_tool_defs, handle, tool_defs, MCP_VERSION};

/// The session a server's tools act for.
pub(crate) struct Session {
    pub(crate) parent_task: String,
    pub(crate) project: String,
    pub(crate) is_orchestrator: bool,
}

/// The MCP stdio loop: newline-delimited JSON-RPC 2.0 with the agent.
///
/// It ends only when `input` closes or a read or write fails. The agent cannot
/// restart the server, so nothing a request does may end it.
/// @param input the agent's messages, one per line
/// @param output where replies are written
/// @param client the daemon connection the tools use
/// @param session the session the tools act for
/// @returns `Ok` once `input` closes, or the read or write error
pub(crate) async fn serve<R, W>(
    mut input: R,
    mut output: W,
    client: &mut DaemonClient,
    session: &Session,
) -> Result<()>
where
    R: AsyncBufRead + Unpin,
    W: AsyncWrite + Unpin,
{
    let mut line = Vec::new();
    loop {
        line.clear();
        if input.read_until(b'\n', &mut line).await? == 0 {
            return Ok(());
        }
        let Ok(message) = serde_json::from_slice::<Value>(&line) else {
            continue;
        };
        // Notifications (no id) and responses (no method) get no reply.
        let (Some(method), Some(id)) = (
            message.get("method").and_then(Value::as_str),
            message.get("id").cloned(),
        ) else {
            continue;
        };
        let reply = match method {
            "initialize" => Ok(json!({
                "protocolVersion": MCP_VERSION,
                "capabilities": { "tools": {} },
                "serverInfo": {
                    "name": "warpforge",
                    "version": env!("CARGO_PKG_VERSION"),
                },
            })),
            "tools/list" => Ok(json!({ "tools": session_tools(session) })),
            "tools/call" => Ok(call_tool(client, session, message.get("params")).await),
            "ping" => Ok(json!({})),
            other => {
                Err(json!({ "code": -32601, "message": format!("method not found: {other}") }))
            }
        };
        let frame = match reply {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err(error) => json!({ "jsonrpc": "2.0", "id": id, "error": error }),
        };
        output.write_all(frame.to_string().as_bytes()).await?;
        output.write_all(b"\n").await?;
        output.flush().await?;
    }
}

fn session_tools(session: &Session) -> Value {
    let mut tools = tool_defs(session.is_orchestrator);
    if let (Value::Array(list), false) = (&mut tools, session.project.is_empty()) {
        list.extend(browser_tool_defs());
    }
    tools
}

async fn call_tool(client: &mut DaemonClient, session: &Session, params: Option<&Value>) -> Value {
    let call = handle::tool_content(
        client,
        &session.parent_task,
        &session.project,
        session.is_orchestrator,
        params,
    );
    let error = match AssertUnwindSafe(call).catch_unwind().await {
        Ok(Ok(content)) => return json!({ "content": content }),
        Ok(Err(error)) => format!("Error: {error:#}"),
        // The panic hook has already written the message to stderr.
        Err(_) => "Error: the tool crashed inside the warpforge MCP server".to_string(),
    };
    json!({ "content": [{ "type": "text", "text": error }], "isError": true })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mcp::daemon_client::fake::FakeDaemon;

    async fn run(daemon: &FakeDaemon, is_orchestrator: bool, input: &[u8]) -> Vec<Value> {
        let mut client = DaemonClient::new(Box::new(daemon.clone()));
        let session = Session {
            parent_task: "t_orch".into(),
            project: "demo".into(),
            is_orchestrator,
        };
        let mut output = Vec::new();
        serve(input, &mut output, &mut client, &session)
            .await
            .expect("serve returns Ok at end of input");
        String::from_utf8(output)
            .unwrap()
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect()
    }

    fn call(id: u64, tool: &str) -> String {
        json!({ "jsonrpc": "2.0", "id": id, "method": "tools/call",
                "params": { "name": tool, "arguments": {} } })
        .to_string()
    }

    #[tokio::test]
    async fn a_daemon_that_is_down_is_a_tool_error_and_serving_goes_on() {
        let input = format!(
            "{}\n{}\n{}\n",
            call(1, "list_runtime"),
            json!({ "id": 2, "method": "tools/list" }),
            json!({ "id": 3, "method": "ping" }),
        );
        let replies = run(&FakeDaemon::default(), true, input.as_bytes()).await;

        assert_eq!(replies.len(), 3);
        assert_eq!(replies[0]["result"]["isError"], true);
        let text = replies[0]["result"]["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("daemon.json"), "{text}");
        let tools = replies[1]["result"]["tools"].as_array().unwrap();
        assert!(tools.iter().any(|tool| tool["name"] == "spawn_agent"));
        assert_eq!(
            replies[2],
            json!({ "jsonrpc": "2.0", "id": 3, "result": {} })
        );
    }

    #[tokio::test]
    async fn lines_that_are_not_utf8_or_not_json_are_skipped() {
        let mut input = b"\xff\xfe\x00garbage\n{not json\n\n".to_vec();
        input.extend_from_slice(json!({ "id": 1, "method": "ping" }).to_string().as_bytes());
        let replies = run(&FakeDaemon::default(), false, &input).await;

        assert_eq!(replies.len(), 1);
        assert_eq!(replies[0]["id"], 1);
    }

    #[tokio::test]
    async fn only_requests_are_answered_and_unknown_ones_get_method_not_found() {
        let input = format!(
            "{}\n{}\n{}\n",
            json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
            json!({ "jsonrpc": "2.0", "id": 9, "result": {} }),
            json!({ "jsonrpc": "2.0", "id": 4, "method": "resources/list" }),
        );
        let replies = run(&FakeDaemon::default(), false, input.as_bytes()).await;

        assert_eq!(replies.len(), 1);
        assert_eq!(replies[0]["id"], 4);
        assert_eq!(replies[0]["error"]["code"], -32601);
    }

    #[tokio::test]
    async fn a_tool_that_panics_is_a_tool_error_and_serving_goes_on() {
        let daemon = FakeDaemon::at("ws://a");
        daemon.state().panic_on_endpoint = true;
        let input = format!("{}\n{}\n", call(1, "list_runtime"), call(2, "spawn_agent"));
        let replies = run(&daemon, false, input.as_bytes()).await;

        assert_eq!(replies.len(), 2);
        assert_eq!(replies[0]["result"]["isError"], true);
        let text = replies[1]["result"]["content"][0]["text"].as_str().unwrap();
        assert!(
            text.contains("only available in an orchestrator session"),
            "{text}"
        );
    }

    #[test]
    fn browser_tools_are_listed_only_for_a_session_bound_to_a_project() {
        for (project, listed) in [("demo", true), ("", false)] {
            let session = Session {
                parent_task: "t_1".into(),
                project: project.into(),
                is_orchestrator: false,
            };
            let tools = session_tools(&session);
            let names: Vec<&str> = tools
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|tool| tool["name"].as_str())
                .collect();
            assert_eq!(names.contains(&"browser_snapshot"), listed, "{project:?}");
            assert!(names.contains(&"list_runtime"));
        }
    }

    #[tokio::test]
    async fn a_tool_call_reaches_the_daemon() {
        let input = call(1, "list_runtime");
        let replies = run(&FakeDaemon::at("ws://a"), false, input.as_bytes()).await;

        assert_eq!(replies[0]["result"]["isError"], Value::Null);
        let text = replies[0]["result"]["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("runtime.list"), "{text}");
    }
}
