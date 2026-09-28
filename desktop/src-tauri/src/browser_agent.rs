//! The daemon's browser tools, run in a tab: outline, click, type and console
//! through `browser_agent.js`, and screenshots. Each one first checks, from the
//! native view's URL rather than anything the page can script, that the page is
//! on an origin the daemon allowed.

use std::sync::{mpsc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Url, Webview};

/// Injected before page scripts; answers `__wfAgent(call)` and keeps the
/// page's console messages from the start of the load.
pub(crate) const AGENT_SCRIPT: &str = include_str!("browser_agent.js");

const PAGE_TIMEOUT: Duration = Duration::from_secs(10);

/// The tool's error when the tab has no native view, which the web side reads
/// to decide whether to open one.
const NO_TAB: &str = "no such browser tab";

fn webview_for(app: &AppHandle, tab_id: &str) -> Result<Webview, String> {
    app.get_webview(&crate::browser::label_for(tab_id))
        .ok_or_else(|| NO_TAB.to_string())
}

/// The page's URL when its origin is allowed, else the `blocked` answer the
/// daemon asks the user about.
fn gate(webview: &Webview, allowed: &[String]) -> Result<Result<Url, Value>, String> {
    let url = webview.url().map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(format!(
            "no web page is open in the browser tab (it shows {url}); open one with browser_navigate"
        ));
    }
    let origin = url.origin().ascii_serialization();
    if allowed.contains(&origin) {
        Ok(Ok(url))
    } else {
        Ok(Err(json!({ "blocked": origin, "url": url.as_str() })))
    }
}

async fn wait<T: Send + 'static>(rx: mpsc::Receiver<T>) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(PAGE_TIMEOUT))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|_| "the page did not answer within 10s; it may be busy or still loading".into())
}

/// Run one `browser_agent.js` call in the tab.
/// @param tab_id the tab
/// @param call the call, e.g. `{ "action": "click", "ref": "e3" }`
/// @param allowed_origins origins the page may be on
/// @returns the script's result, or `{ blocked }` when the page is elsewhere
#[tauri::command]
pub async fn browser_agent_call(
    app: AppHandle,
    tab_id: String,
    call: Value,
    allowed_origins: Vec<String>,
) -> Result<Value, String> {
    let webview = webview_for(&app, &tab_id)?;
    if let Err(blocked) = gate(&webview, &allowed_origins)? {
        return Ok(blocked);
    }
    let js = format!(
        "(function(){{var a=window.__wfAgent;return typeof a==='function'?a({call}):null;}})()"
    );
    let (tx, rx) = mpsc::channel();
    let tx = Mutex::new(Some(tx));
    webview
        .eval_with_callback(js, move |raw| {
            if let Some(tx) = tx.lock().ok().and_then(|mut slot| slot.take()) {
                let _ = tx.send(raw);
            }
        })
        .map_err(|e| e.to_string())?;
    let raw = wait(rx).await?;
    // The callback hands back the script's string result JSON-encoded; an
    // empty or non-string result means the script is not in this page.
    let text: String = serde_json::from_str(&raw).map_err(|_| {
        "the page did not run the browser script; reload it and try again".to_string()
    })?;
    let value: Value = serde_json::from_str(&text)
        .map_err(|e| format!("the browser script returned invalid JSON: {e}"))?;
    match value.get("error").and_then(Value::as_str) {
        Some(error) => Err(error.to_string()),
        None => Ok(value),
    }
}

/// Screenshot what the tab shows.
/// @param tab_id the tab
/// @param allowed_origins origins the page may be on
/// @returns `{ data, mimeType, url }` with base64 JPEG data, or `{ blocked }`
#[tauri::command]
pub async fn browser_agent_screenshot(
    app: AppHandle,
    tab_id: String,
    allowed_origins: Vec<String>,
) -> Result<Value, String> {
    let webview = webview_for(&app, &tab_id)?;
    let url = match gate(&webview, &allowed_origins)? {
        Ok(url) => url,
        Err(blocked) => return Ok(blocked),
    };
    let rx = crate::browser_capture::capture_page(&webview)?;
    let data = wait(rx).await??;
    Ok(json!({ "data": data, "mimeType": "image/jpeg", "url": url.as_str() }))
}
