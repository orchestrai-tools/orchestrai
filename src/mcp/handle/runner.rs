use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use super::backlog::{find, project_of};
use crate::mcp::daemon_client::DaemonClient;

pub(super) async fn dispatch(
    name: &str,
    client: &mut DaemonClient,
    parent_task: &str,
    project: &str,
    args: &Value,
) -> Result<String> {
    let proj = project_of(args, project)?;
    match name {
        "runner_enqueue" => {
            let mut numbers: Vec<Value> = args
                .get("numbers")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if let Some(number) = args.get("number").filter(|n| !n.is_null()) {
                numbers.insert(0, number.clone());
            }
            if numbers.is_empty() {
                return Err(anyhow!("give 'number' (as in #87) or 'numbers'"));
            }
            let mut item_ids = Vec::new();
            for number in numbers {
                let item = find(client, &proj, &json!({ "number": number })).await?;
                item_ids.push(item["id"].clone());
            }
            let origin = Some(parent_task).filter(|t| !t.is_empty());
            let location = match args.get("run_location").and_then(Value::as_str) {
                None => "default",
                Some(value @ ("default" | "worktree" | "checkout")) => value,
                Some(other) => {
                    return Err(anyhow!(
                        "run_location must be default, worktree or checkout, not '{other}'"
                    ))
                }
            };
            let status = client
                .request(
                    "runner.enqueue",
                    json!({ "project": proj, "item_ids": item_ids, "origin_task": origin,
                            "run_location": location }),
                )
                .await?;
            Ok(format!("Queued.\n{}", describe(&status)))
        }
        "runner_status" => {
            let status = client
                .request("runner.status", json!({ "project": proj }))
                .await?;
            let mut out = describe(&status);
            if args.get("runs").and_then(Value::as_bool) == Some(true) {
                let runs = client
                    .request("runner.runs", json!({ "project": proj, "limit": 10 }))
                    .await?;
                out.push_str("\n\nRecent runs:\n");
                out.push_str(&runs_text(&runs["runs"]));
            }
            Ok(out)
        }
        other => Err(anyhow!("unknown tool: {other}")),
    }
}

fn describe(status: &Value) -> String {
    let settings = &status["settings"];
    let state = if settings["running"].as_bool() == Some(true) {
        "running"
    } else {
        "paused"
    };
    let mut lines = vec![format!(
        "Factory: {state} — workflow {}, up to {} at a time, {} open pull request(s) max, {} of {} started in the last 24 hours",
        settings["workflow"].as_str().unwrap_or("?"),
        settings["maxConcurrent"],
        settings["maxOpenPrs"],
        status["dispatchedToday"],
        settings["maxPerDay"],
    )];
    if let Some(hold) = status["hold"].as_str() {
        lines.push(format!("Waiting: {hold}"));
    }
    let entries = status["entries"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    if entries.is_empty() {
        lines.push("The queue is empty.".to_string());
    }
    for entry in entries {
        let location = entry["resolvedLocation"]
            .as_str()
            .or_else(|| entry["runLocation"].as_str().filter(|l| *l != "default"))
            .map(|l| format!(" · {l}"))
            .unwrap_or_default();
        let mut line = format!(
            "#{} [{}{location}] {}",
            entry["number"],
            entry["state"].as_str().unwrap_or("?"),
            entry["title"].as_str().unwrap_or_default()
        );
        if let Some(url) = entry["prUrl"].as_str() {
            line.push_str(&format!(" — {url}"));
        } else if let Some(reason) = entry["waitingReason"].as_str() {
            line.push_str(&format!(" — waiting: {reason}"));
        }
        lines.push(line);
    }
    lines.join("\n")
}

fn runs_text(runs: &Value) -> String {
    let runs = runs.as_array().map(Vec::as_slice).unwrap_or(&[]);
    if runs.is_empty() {
        return "(none)".to_string();
    }
    runs.iter()
        .map(|run| {
            let cost = run["costUsd"]
                .as_f64()
                .map(|usd| format!("${usd:.2}"))
                .unwrap_or_else(|| "cost not reported".to_string());
            let mut line = format!(
                "#{} {} — {}, {} review round(s), {cost}",
                run["itemNumber"],
                run["itemTitle"].as_str().unwrap_or_default(),
                run["outcome"].as_str().unwrap_or("?"),
                run["rounds"],
            );
            if let Some(url) = run["prUrl"].as_str() {
                line.push_str(&format!(", {url}"));
            }
            if let Some(detail) = run["detail"].as_str() {
                line.push_str(&format!(" ({detail})"));
            }
            line
        })
        .collect::<Vec<_>>()
        .join("\n")
}
