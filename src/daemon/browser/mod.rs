//! The agent's hands in the in-app browser. The desktop app owns the page and
//! runs the action; the daemon decides which origins the agent may act on and
//! asks the user about the rest (`docs/adr/0021`).

use std::time::Duration;

use serde_json::Value;
use warpforge_protocol as wire;

use crate::daemon::actor::DaemonHandle;
use crate::daemon::server::{ClientHub, ClientRequestError};

mod origins;

pub(crate) use origins::Grants;

/// How long the desktop has for one action, a page load or a reopened tab
/// included.
const ACTION_TIMEOUT: Duration = Duration::from_secs(40);
/// How long an approval prompt waits for the user before it is withdrawn.
pub(crate) const ASK_TIMEOUT: Duration = Duration::from_secs(300);

/// Run one browser action for the agent of `task_id`.
/// @param handle the daemon actor
/// @param clients the connected clients, one of which owns the browser
/// @param grants origins the user allowed for the rest of a task
/// @param project the project whose browser tab is driven
/// @param task_id the agent's task, where approval prompts appear
/// @param action what to do
/// @returns the desktop's result, or a message for the agent
pub(crate) async fn act(
    handle: &DaemonHandle,
    clients: &ClientHub,
    grants: &Grants,
    project: &str,
    task_id: &str,
    mut action: wire::BrowserAction,
) -> Result<Value, String> {
    let snapshot = handle.snapshot().await;
    if !snapshot.projects.iter().any(|p| p.name == project) {
        return Err(format!("no project named '{project}'"));
    }
    let mut allowed = origins::service_origins(&snapshot, project);
    allowed.extend(grants.of(task_id));

    if let wire::BrowserAction::Navigate { url } = &mut action {
        let (target, origin) = origins::web_url(url)?;
        *url = target;
        if !allowed.contains(&origin) {
            approve(handle, grants, task_id, &origin, &action).await?;
            allowed.push(origin);
        }
    }

    // The page's origin is checked by the desktop right before it acts, so a
    // page that moved since the last call is caught there, not here.
    let mut approved = false;
    loop {
        let body = wire::ClientRequestBody::Browser {
            project: project.to_string(),
            action: action.clone(),
            allowed_origins: allowed.clone(),
        };
        let result = clients
            .request(body, ACTION_TIMEOUT)
            .await
            .map_err(|error| explain(error, &action))?;
        let Some(origin) = result.get("blocked").and_then(Value::as_str) else {
            return Ok(result);
        };
        if approved {
            return Err(format!(
                "the page moved to {origin} while waiting for approval; take a new browser_snapshot and try again"
            ));
        }
        approve(handle, grants, task_id, origin, &action).await?;
        allowed.push(origin.to_string());
        approved = true;
    }
}

/// Ask the user whether the agent may act on `origin`, and wait for the answer.
async fn approve(
    handle: &DaemonHandle,
    grants: &Grants,
    task_id: &str,
    origin: &str,
    action: &wire::BrowserAction,
) -> Result<(), String> {
    if task_id.is_empty() {
        return Err(format!(
            "{origin} is not one of this project's services, and this session has no Warpforge \
             task to ask the user on, so the action did not run"
        ));
    }
    let title = format!(
        "Let the agent {} on {origin} in the browser? It acts in your signed-in session; \
         \"allow always\" covers {origin} for the rest of this task.",
        verb(action)
    );
    let ask = handle.ask_user(task_id, &title).await?;
    let outcome = match tokio::time::timeout(ASK_TIMEOUT, ask.answer).await {
        Ok(Ok(outcome)) => outcome,
        Ok(Err(_)) => {
            return Err(format!(
                "the approval prompt for {origin} was withdrawn, so the action did not run"
            ))
        }
        Err(_) => {
            handle.withdraw_ask(task_id, &ask.request_id).await;
            return Err(format!(
                "nobody answered the approval prompt for {origin} within {} minutes, so the action \
                 did not run",
                ASK_TIMEOUT.as_secs() / 60
            ));
        }
    };
    match outcome.as_str() {
        "allow" => Ok(()),
        "allow_always" => {
            grants.add(task_id, origin);
            Ok(())
        }
        _ => Err(format!(
            "the user declined browser access to {origin}; the action did not run. Do not retry \
             it unless the user asks you to."
        )),
    }
}

fn verb(action: &wire::BrowserAction) -> &'static str {
    match action {
        wire::BrowserAction::Snapshot => "read the page",
        wire::BrowserAction::Click { .. } => "click",
        wire::BrowserAction::Type { .. } => "type",
        wire::BrowserAction::Navigate { .. } => "open a page",
        wire::BrowserAction::Screenshot => "take a screenshot",
        wire::BrowserAction::Console => "read the console",
    }
}

fn explain(error: ClientRequestError, action: &wire::BrowserAction) -> String {
    match error {
        ClientRequestError::NoClient => "no Warpforge desktop app is connected, so there is no \
             browser to act in. Ask the user to open the app."
            .into(),
        ClientRequestError::Disconnected => {
            "the desktop app disconnected before it finished the action".into()
        }
        ClientRequestError::TimedOut => format!(
            "the browser did not finish {} within {}s",
            action.name(),
            ACTION_TIMEOUT.as_secs()
        ),
        ClientRequestError::Failed(message) => message,
    }
}
