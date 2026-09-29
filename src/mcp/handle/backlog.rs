use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use crate::mcp::daemon_client::DaemonClient;
use crate::mcp::format::json_text;

pub(crate) const STATUSES: [&str; 5] = ["todo", "in_progress", "waiting", "done", "cancelled"];
pub(crate) const PRIORITIES: [&str; 5] = ["none", "low", "medium", "high", "urgent"];

const PAGE: u64 = 100;

pub(super) async fn dispatch(
    name: &str,
    client: &mut DaemonClient,
    project: &str,
    args: &Value,
) -> Result<String> {
    match name {
        "create_backlog_task" | "create_task" => {
            let title = text(args, "title")
                .or_else(|| text(args, "prompt"))
                .ok_or_else(|| anyhow!("'title' is required (or the legacy 'prompt')"))?;
            let proj = project_of(args, project)?;
            let result = client
                .request(
                    "backlog.create",
                    json!({
                        "project": proj,
                        "title": title,
                        "body": args.get("body").and_then(Value::as_str).unwrap_or_default(),
                        "priority": args.get("priority").and_then(Value::as_str).unwrap_or_default(),
                        "status": args.get("status").and_then(Value::as_str).unwrap_or_default(),
                        "source": "local"
                    }),
                )
                .await?;
            Ok(format!("Created backlog item\n{}", json_text(&result)?))
        }
        "list_backlog_tasks" => list(client, project, args).await,
        "get_backlog_task" => {
            let proj = project_of(args, project)?;
            let item = find(client, &proj, args).await?;
            Ok(detail(&item))
        }
        "update_backlog_task" => {
            let proj = project_of(args, project)?;
            let mut patch = serde_json::Map::new();
            for key in ["title", "body"] {
                if let Some(value) = args.get(key).and_then(Value::as_str) {
                    patch.insert(key.into(), value.into());
                }
            }
            if let Some(status) = choice(args, "status", &STATUSES)? {
                patch.insert("status".into(), status.into());
            }
            if let Some(priority) = choice(args, "priority", &PRIORITIES)? {
                patch.insert("priority".into(), priority.into());
            }
            if text(args, "title").is_none() && patch.contains_key("title") {
                return Err(anyhow!("'title' cannot be empty"));
            }
            if patch.is_empty() {
                return Err(anyhow!(
                    "nothing to update: give title, body, status or priority"
                ));
            }
            let item = find(client, &proj, args).await?;
            let updated = apply(client, &proj, &item, patch).await?;
            Ok(format!("Updated backlog item\n{}", summary(&updated)))
        }
        "close_backlog_task" => {
            let proj = project_of(args, project)?;
            let status = choice(args, "status", &["done", "cancelled"])?.unwrap_or("done");
            let item = find(client, &proj, args).await?;
            let mut patch = serde_json::Map::new();
            patch.insert("status".into(), status.into());
            if let Some(note) = text(args, "note") {
                let old = item["body"].as_str().unwrap_or_default().trim_end();
                let sep = if old.is_empty() { "" } else { "\n\n" };
                patch.insert(
                    "body".into(),
                    format!("{old}{sep}Closed: {}", note.trim()).into(),
                );
            }
            let updated = apply(client, &proj, &item, patch).await?;
            Ok(format!("Closed backlog item\n{}", summary(&updated)))
        }
        other => Err(anyhow!("unknown tool: {other}")),
    }
}

fn text<'a>(args: &'a Value, key: &str) -> Option<&'a str> {
    args.get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
}

fn project_of(args: &Value, session: &str) -> Result<String> {
    text(args, "project")
        .or_else(|| Some(session.trim()).filter(|p| !p.is_empty()))
        .map(str::to_string)
        .ok_or_else(|| anyhow!("project is required"))
}

/// An optional argument that must be one of `valid`.
fn choice<'a>(args: &'a Value, key: &str, valid: &[&'a str]) -> Result<Option<&'a str>> {
    let Some(raw) = text(args, key) else {
        return Ok(None);
    };
    let wanted = raw.trim().to_lowercase();
    match valid.iter().find(|v| **v == wanted) {
        Some(v) => Ok(Some(v)),
        None => Err(anyhow!(
            "invalid {key} '{raw}'; valid values: {}",
            valid.join(", ")
        )),
    }
}

async fn list(client: &mut DaemonClient, session: &str, args: &Value) -> Result<String> {
    let proj = project_of(args, session)?;
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(50)
        .clamp(1, PAGE);
    let page = client
        .request(
            "backlog.list",
            json!({
                "project": proj,
                "page": 0,
                "page_size": limit,
                "sort_desc": true,
                "search": text(args, "search").unwrap_or_default(),
                "status": choice(args, "status", &STATUSES)?,
                "priority": choice(args, "priority", &PRIORITIES)?,
            }),
        )
        .await?;
    let items = page["items"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    let total = page["total"].as_u64().unwrap_or(items.len() as u64);
    let mut out: Vec<String> = items.iter().map(summary).collect();
    out.push(format!("Total: {total} (showing {})", items.len()));
    Ok(out.join("\n"))
}

/// Find an item by `number` (or `id`) by walking the project's items in number
/// order, so it is found however many the project has.
async fn find(client: &mut DaemonClient, proj: &str, args: &Value) -> Result<Value> {
    let number = match args.get("number") {
        None | Some(Value::Null) => None,
        Some(v) => Some(
            v.as_u64()
                .or_else(|| v.as_str()?.trim().trim_start_matches('#').parse().ok())
                .ok_or_else(|| anyhow!("'number' must be a positive integer, as in #87"))?,
        ),
    };
    let id = text(args, "id");
    if number.is_none() && id.is_none() {
        return Err(anyhow!("give 'number' (as in #87) or 'id'"));
    }
    let missing = || match number {
        Some(n) => anyhow!("no backlog item #{n} in project '{proj}'"),
        None => anyhow!(
            "no backlog item with id '{}' in project '{proj}'",
            id.unwrap_or_default()
        ),
    };
    let mut page = 0;
    loop {
        let result = client
            .request(
                "backlog.list",
                json!({ "project": proj, "page": page, "page_size": PAGE, "sort_by": "number" }),
            )
            .await?;
        let items = result["items"].as_array().map(Vec::as_slice).unwrap_or(&[]);
        for item in items {
            let n = item["number"].as_u64();
            match number {
                Some(want) if n == Some(want) => return Ok(item.clone()),
                Some(want) if n > Some(want) => return Err(missing()),
                None if item["id"].as_str() == id => return Ok(item.clone()),
                _ => {}
            }
        }
        if items.is_empty() || result["hasNextPage"].as_bool() != Some(true) {
            return Err(missing());
        }
        page += 1;
    }
}

async fn apply(
    client: &mut DaemonClient,
    proj: &str,
    item: &Value,
    patch: serde_json::Map<String, Value>,
) -> Result<Value> {
    let mut params = Value::Object(patch);
    params["item_id"] = item["id"].clone();
    params["project"] = proj.into();
    client.request("backlog.update", params).await
}

fn summary(item: &Value) -> String {
    format!(
        "#{} [{}] [{}] {}",
        item["number"],
        item["status"].as_str().unwrap_or("?"),
        item["priority"].as_str().unwrap_or("none"),
        item["title"].as_str().unwrap_or_default()
    )
}

fn detail(item: &Value) -> String {
    let mut lines = vec![
        summary(item),
        format!("id: {}", item["id"].as_str().unwrap_or_default()),
        format!("source: {}", item["source"].as_str().unwrap_or("local")),
    ];
    for (key, label) in [
        ("assignee", "assignee"),
        ("taskId", "task"),
        ("externalId", "external id"),
        ("url", "url"),
        ("remoteStatus", "remote status"),
    ] {
        if let Some(value) = item[key].as_str().filter(|v| !v.is_empty()) {
            lines.push(format!("{label}: {value}"));
        }
    }
    let body = item["body"].as_str().unwrap_or_default().trim();
    lines.push(String::new());
    lines.push(if body.is_empty() { "(no body)" } else { body }.to_string());
    lines.join("\n")
}
