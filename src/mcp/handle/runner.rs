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
            let text = |key: &str| args.get(key).and_then(Value::as_str).map(str::to_string);
            let deliver = args.get("pull_request").and_then(Value::as_bool);
            let result = client
                .request(
                    "runner.enqueue",
                    json!({ "project": proj, "item_ids": item_ids, "origin_task": origin,
                            "run_location": location, "workflow": text("workflow"),
                            "agent": text("agent"), "model": text("model"),
                            "deliver": deliver }),
                )
                .await?;
            Ok(format!(
                "{}\n{}",
                enqueue_text(&result),
                describe(&result["status"])
            ))
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

fn enqueue_text(result: &Value) -> String {
    let list = |key: &str| {
        result[key]
            .as_array()
            .map(Vec::as_slice)
            .unwrap_or(&[])
            .to_vec()
    };
    let created = list("created");
    let started = created
        .iter()
        .filter(|c| c["started"].as_bool() == Some(true))
        .count();
    let mut lines = vec![format!(
        "Created {} Factory task(s): {started} started, {} queued.",
        created.len(),
        created.len() - started
    )];
    for skip in list("skipped") {
        let why = match skip["reason"]["kind"].as_str() {
            Some("already_in_factory") => "already in the Factory".to_string(),
            Some("closed") => format!(
                "already {}",
                skip["reason"]["status"].as_str().unwrap_or("closed")
            ),
            Some("not_found") => "no such item".to_string(),
            _ => skip["reason"]["detail"]
                .as_str()
                .unwrap_or("could not be read")
                .to_string(),
        };
        lines.push(format!("Skipped #{}: {why}", skip["number"]));
    }
    lines.join("\n")
}

/// A Factory wait in words.
fn wait_text(wait: &Value) -> Option<String> {
    let n = |key: &str| wait[key].as_u64().unwrap_or_default();
    Some(match wait["kind"].as_str()? {
        "slots" => format!(
            "waiting for a free slot ({} of {} in use)",
            n("inUse"),
            n("limit")
        ),
        "open_prs" => format!(
            "{} draft pull request(s) are open (limit {}) — merge or close one",
            n("open"),
            n("limit")
        ),
        "daily" => format!(
            "{} of {} started in the last 24 hours",
            n("started"),
            n("limit")
        ),
        "quota" => format!(
            "{} is near its quota{}",
            wait["agent"].as_str().unwrap_or("an agent"),
            wait["usedPct"]
                .as_u64()
                .map(|p| format!(" ({p}% used)"))
                .unwrap_or_default()
        ),
        "disk" => format!(
            "low disk space ({} GB free, needs {} GB)",
            n("freeGb"),
            n("minGb")
        ),
        "checkout_busy" => match wait["cause"].as_str() {
            Some("dirty") => "the project folder has uncommitted changes".to_string(),
            Some("operation") => "a git operation is in progress in the project folder".to_string(),
            Some("task_running") => "another task is running in the project folder".to_string(),
            Some("yaml_backlog") => {
                "the backlog is stored in the project folder, which the Factory would switch"
                    .to_string()
            }
            Some("in_use") => "another Factory task is using the project folder".to_string(),
            _ => wait["detail"]
                .as_str()
                .unwrap_or("the project folder is busy")
                .to_string(),
        },
        "checkout_held" => wait["reason"].as_str().unwrap_or_default().to_string(),
        "workflow_invalid" => format!(
            "workflow `{}` cannot be used: {}",
            wait["workflow"].as_str().unwrap_or("?"),
            wait["error"].as_str().unwrap_or_default()
        ),
        _ => wait["detail"].as_str().unwrap_or("waiting").to_string(),
    })
}

fn describe(status: &Value) -> String {
    let settings = &status["settings"];
    let mut lines = vec![format!(
        "Factory — workflow {}, up to {} at a time, pauses at {} open draft pull request(s), {} of {} started in the last 24 hours",
        settings["workflow"].as_str().unwrap_or("?"),
        settings["maxConcurrent"],
        settings["maxOpenPrs"],
        status["dispatchedToday"],
        settings["maxPerDay"],
    )];
    if let Some(hold) = wait_text(&status["hold"]) {
        lines.push(format!("Queued tasks wait: {hold}"));
    }
    let entries = status["entries"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    if entries.is_empty() {
        lines.push("No Factory tasks are queued or running.".to_string());
    }
    for entry in entries {
        let location = entry["resolvedLocation"]
            .as_str()
            .or_else(|| entry["runLocation"].as_str().filter(|l| *l != "default"))
            .map(|l| format!(" · {l}"))
            .unwrap_or_default();
        let number = entry["number"]
            .as_u64()
            .filter(|n| *n > 0)
            .map(|n| format!("#{n} "))
            .unwrap_or_default();
        let mut line = format!(
            "{number}[{}{location}] {} (task {})",
            entry["state"].as_str().unwrap_or("?"),
            entry["title"].as_str().unwrap_or_default(),
            entry["taskId"].as_str().unwrap_or("?"),
        );
        if let Some(url) = entry["prUrl"].as_str() {
            line.push_str(&format!(" — {url}"));
        } else if let Some(wait) = wait_text(&entry["wait"]) {
            line.push_str(&format!(" — {wait}"));
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
