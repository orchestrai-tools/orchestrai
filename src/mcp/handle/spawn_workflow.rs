//! `spawn_workflow`: an orchestrator starts a Factory pipeline for any goal,
//! as its own child without a pull request, or through the Factory queue
//! with one, exactly as New Task does.

use anyhow::{anyhow, Result};
use serde_json::{json, Value};

use super::backlog::find;
use crate::mcp::agents::validate_model;
use crate::mcp::daemon_client::DaemonClient;

/// Start the pipeline `args` describe.
/// @param client the daemon connection
/// @param parent_task the orchestrator session asking
/// @param project the orchestrator's project
/// @param args the tool arguments
/// @returns what was started, in words for the orchestrator
pub(super) async fn spawn(
    client: &mut DaemonClient,
    parent_task: &str,
    project: &str,
    args: &Value,
) -> Result<String> {
    let text = |key: &str| {
        args.get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
    };
    let workflow_id = text("workflow_id").ok_or_else(|| anyhow!("'workflow_id' is required"))?;
    let agent = text("agent").ok_or_else(|| anyhow!("'agent' is required"))?;
    let model = text("model");
    let pull_request = args
        .get("pull_request")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let location = match text("run_location").as_deref() {
        None => None,
        Some("auto" | "default") => Some("default"),
        Some("worktree") => Some("worktree"),
        Some("checkout") => Some("checkout"),
        Some(other) => {
            return Err(anyhow!(
                "run_location must be auto, worktree or checkout, not '{other}'"
            ))
        }
    };
    let item = match args.get("backlog_item").filter(|n| !n.is_null()) {
        Some(number) => Some(find(client, project, &json!({ "number": number })).await?),
        None => None,
    };
    let item_id = item
        .as_ref()
        .and_then(|i| i["id"].as_str())
        .map(str::to_string);
    let goal = match (text("goal"), item_id.as_deref()) {
        (Some(goal), _) => goal,
        (None, Some(item_id)) => client
            .request(
                "runner.brief",
                json!({ "project": project, "item_id": item_id }),
            )
            .await?["prompt"]
            .as_str()
            .unwrap_or_default()
            .to_string(),
        (None, None) => return Err(anyhow!("'goal' is required unless backlog_item is given")),
    };
    if let Some(model) = model.as_deref() {
        check_model(client, &agent, model).await?;
    }
    let mut params = json!({
        "project": project,
        "prompt": goal,
        "agent": agent,
        "default_model": model,
        "include_runtime_context": true,
        "parent_task_id": parent_task,
        "workflow": workflow_id,
        "backlog_item_id": item_id,
    });
    if pull_request {
        params["factory"] =
            json!({ "deliver": true, "runLocation": location.unwrap_or("default") });
        let result = client.request("task.create", params).await?;
        let task = result["taskId"].as_str().unwrap_or("(unknown)");
        let when = if result["started"].as_bool() == Some(true) {
            "It started"
        } else {
            "It waits in the Factory queue until the project's limits allow it"
        };
        return Ok(format!(
            "Started Factory task {task} with workflow '{workflow_id}' and a draft pull request. \
             {when}. It is not your sub-agent: nothing arrives in your inbox, a successful run \
             ends as a draft pull request for a person to review, and its questions go to the \
             person. Follow it with runner_status."
        ));
    }
    let worktree = match location {
        Some("default") => automatic_location(client, project, &workflow_id).await? == "worktree",
        Some(value) => value == "worktree",
        None => false,
    };
    params["tags"] = json!(["orchestrator", "workflow-subagent"]);
    params["worktree"] = json!(worktree);
    let result = client.request("task.create", params).await?;
    let child = result
        .get("taskId")
        .and_then(Value::as_str)
        .unwrap_or("(unknown)");
    if let Some(item_id) = item_id.as_deref() {
        client
            .request(
                "workItem.linkTask",
                json!({ "item_id": item_id, "task_id": child }),
            )
            .await?;
    }
    Ok(format!(
        "Dispatched workflow '{workflow_id}' as task {child}. It runs asynchronously \
         through its own plan/implement/review/fix stages; you will be notified when \
         its result is waiting — then call read_inbox. Check list_agents for its \
         progress and whether it needs an answer (answer_workflow) or a decision \
         (decide_workflow)."
    ))
}

/// Refuse a model the agent does not list; an agent without a cached list
/// is not judged.
async fn check_model(client: &mut DaemonClient, agent: &str, model: &str) -> Result<()> {
    let agents = client.request("agents.list", json!({})).await?;
    let models = agents["agents"]
        .as_array()
        .and_then(|list| list.iter().find(|a| a["id"].as_str() == Some(agent)))
        .and_then(|a| a["models"].as_array())
        .cloned()
        .unwrap_or_default();
    validate_model(&models, model, agent)
}

/// Where Automatic runs a pipeline: the project's Factory setting, else the
/// project folder for a template that tests the running app.
async fn automatic_location(
    client: &mut DaemonClient,
    project: &str,
    workflow_id: &str,
) -> Result<&'static str> {
    let status = client
        .request("runner.status", json!({ "project": project }))
        .await?;
    match status["settings"]["runLocation"].as_str() {
        Some("worktree") => return Ok("worktree"),
        Some("checkout") => return Ok("checkout"),
        _ => {}
    }
    let workflows = client
        .request("workflow.list", json!({ "project": project }))
        .await?;
    let verifies = workflows["workflows"]
        .as_array()
        .and_then(|list| list.iter().find(|w| w["id"].as_str() == Some(workflow_id)))
        .is_some_and(|w| !w["verifyRequired"].is_null());
    Ok(if verifies { "checkout" } else { "worktree" })
}
