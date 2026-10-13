//! In-app browser: native child webviews driven by a React chrome.
//!
//! A real page cannot live in an `<iframe>` — sites send `X-Frame-Options` and
//! refuse to render — so each tab is a native webview added as a child of the
//! main window. The tab strip, URL bar and buttons are React; this module only
//! creates, positions, navigates and reports the content views.
//!
//! The webview covers the React content within its rectangle, so the chrome
//! stays above it and the view is hidden whenever the browser surface is not the
//! one on screen. Bounds are synced to a placeholder the React side measures.

use serde::Serialize;
use tauri::webview::{PageLoadEvent, WebviewBuilder};
use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl};

mod reload;
mod url;
mod visibility;
pub(crate) use url::current_url;

const HOST_WINDOW: &str = "main";
const STATE_EVENT: &str = "browser:state";

/// Injected before page scripts; dormant until `browser_pick` starts it.
const PICKER_SCRIPT: &str = include_str!("../browser_picker.js");

/// The picker sends a chosen element back by navigating here; the navigation is
/// intercepted and blocked rather than followed.
const ANNOTATE_SCHEME: &str = "wf-annotate:";

/// Every child webview is labelled `browser:<tabId>`, so one namespace of
/// labels belongs to the browser and nothing else collides with it.
pub(crate) fn label_for(tab_id: &str) -> String {
    format!("browser:{tab_id}")
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrowserState {
    tab_id: String,
    url: String,
    loading: bool,
}

fn emit_state(app: &AppHandle, tab_id: &str, url: &str, loading: bool) {
    let _ = app.emit(
        STATE_EVENT,
        BrowserState {
            tab_id: tab_id.to_string(),
            url: url.to_string(),
            loading,
        },
    );
}

fn parse_url(url: &str) -> Result<tauri::Url, String> {
    url.parse().map_err(|_| format!("invalid URL: {url}"))
}

/// Create the tab's webview if it does not exist yet, then position and show it,
/// or with `hidden` keep it out of sight (an agent opening a page in the
/// background). A second call for the same tab navigates and repositions, or
/// with `reuse` only repositions, so a remounted pane keeps the page it left.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn browser_open(
    app: AppHandle,
    tab_id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    reuse: Option<bool>,
    hidden: Option<bool>,
) -> Result<(), String> {
    let target = parse_url(&url)?;
    let label = label_for(&tab_id);

    if let Some(webview) = app.get_webview(&label) {
        return visibility::restore(
            &webview,
            target,
            (x, y, width, height),
            reuse == Some(true),
            hidden == Some(true),
        );
    }

    let window = app
        .get_window(HOST_WINDOW)
        .ok_or_else(|| "main window is not available".to_string())?;

    let tab_for_load = tab_id.clone();
    let app_for_load = app.clone();
    let app_for_nav = app.clone();
    let tab_for_nav = tab_id.clone();
    // The default (non-incognito) data store is persistent per app, so a login
    // survives restarts without any special store handling.
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(target))
        .initialization_script(PICKER_SCRIPT)
        .initialization_script(crate::browser_agent::CONSOLE_SCRIPT)
        .initialization_script(crate::browser_agent::AGENT_SCRIPT)
        .on_navigation(move |url| {
            if !url.as_str().starts_with(ANNOTATE_SCHEME) {
                return true;
            }
            if let Some(payload) = annotation_payload(url) {
                let _ = app_for_nav.emit(
                    "browser:annotation",
                    serde_json::json!({ "tabId": tab_for_nav, "annotation": payload }),
                );
            }
            // Block: the navigation only ever carried the message.
            false
        })
        .on_page_load(move |webview, payload| {
            let loading = matches!(payload.event(), PageLoadEvent::Started);
            emit_state(
                &app_for_load,
                &tab_for_load,
                payload.url().as_str(),
                loading,
            );
            if matches!(payload.event(), PageLoadEvent::Finished) {
                let app = app_for_load.clone();
                let tab = tab_for_load.clone();
                let url = payload.url().to_string();
                // Title is not on the payload; read it once the page settled.
                // The callback hands back the eval result JSON-encoded, so a
                // title is a quoted, escaped string — decode it to plain text.
                let _ = webview.eval_with_callback("document.title", move |raw| {
                    let title = serde_json::from_str::<String>(&raw).unwrap_or(raw);
                    let _ = app.emit(
                        "browser:title",
                        serde_json::json!({ "tabId": tab, "url": url, "title": title }),
                    );
                });
            }
        });

    let webview = window
        .add_child(
            builder,
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|e| e.to_string())?;
    if hidden == Some(true) {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Decode the `d` query parameter of a `wf-annotate://` URL into the element
/// context the picker gathered. The url crate percent-decodes query pairs.
fn annotation_payload(url: &tauri::Url) -> Option<serde_json::Value> {
    let (_, encoded) = url.query_pairs().find(|(k, _)| k == "d")?;
    serde_json::from_str(&encoded).ok()
}

/// Enter element-pick mode on the tab: the next trusted click sends its target's
/// context to the host as a `browser:annotation` event.
#[tauri::command]
pub fn browser_pick(app: AppHandle, tab_id: String) -> Result<(), String> {
    eval(
        &app,
        &tab_id,
        "window.__wfPickStart && window.__wfPickStart()",
    )
}

/// Leave element-pick mode without choosing anything.
#[tauri::command]
pub fn browser_pick_stop(app: AppHandle, tab_id: String) -> Result<(), String> {
    eval(
        &app,
        &tab_id,
        "window.__wfPickStop && window.__wfPickStop()",
    )
}

/// Screenshot the given viewport rect of the tab, emitted as `browser:shot`
/// carrying `captureId` so the caller can pair it with the annotation it made.
#[tauri::command]
pub fn browser_capture_element(
    app: AppHandle,
    tab_id: String,
    capture_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let webview = app
        .get_webview(&label_for(&tab_id))
        .ok_or_else(|| "no such browser tab".to_string())?;
    crate::browser_capture::capture_element(&app, &webview, capture_id, (x, y, width, height));
    Ok(())
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, tab_id: String, url: String) -> Result<(), String> {
    let target = parse_url(&url)?;
    let webview = app
        .get_webview(&label_for(&tab_id))
        .ok_or_else(|| "no such browser tab".to_string())?;
    webview.navigate(target).map_err(|e| e.to_string())
}

/// Back and forward go through the page's own history rather than a Tauri call,
/// because the runtime exposes no history API on a child webview.
#[tauri::command]
pub fn browser_back(app: AppHandle, tab_id: String) -> Result<(), String> {
    eval(&app, &tab_id, "history.back()")
}

#[tauri::command]
pub fn browser_forward(app: AppHandle, tab_id: String) -> Result<(), String> {
    eval(&app, &tab_id, "history.forward()")
}

#[tauri::command]
pub async fn browser_reload(
    app: AppHandle,
    tab_id: String,
    url: Option<String>,
) -> Result<(), String> {
    // Reading the URL waits for the UI thread; a synchronous command runs on
    // that same thread and would prevent its own reply from being processed.
    tauri::async_runtime::spawn_blocking(move || {
        let webview = app
            .get_webview(&label_for(&tab_id))
            .ok_or_else(|| "no such browser tab".to_string())?;
        let current = current_url(&webview)?;
        if let Some(target) = reload::recovery_target(current.as_ref(), url.as_deref())? {
            return webview.navigate(target).map_err(|e| e.to_string());
        }
        reload_from_origin(&webview)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn browser_stop(app: AppHandle, tab_id: String) -> Result<(), String> {
    eval(&app, &tab_id, "window.stop()")
}

#[tauri::command]
pub fn browser_set_bounds(
    app: AppHandle,
    tab_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    set_bounds(&app, &tab_id, x, y, width, height)
}

#[tauri::command]
pub fn browser_set_visible(app: AppHandle, tab_id: String, visible: bool) -> Result<(), String> {
    let webview = app
        .get_webview(&label_for(&tab_id))
        .ok_or_else(|| "no such browser tab".to_string())?;
    if visible {
        webview.show().map_err(|e| e.to_string())
    } else {
        webview.hide().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn browser_close(app: AppHandle, tab_id: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview(&label_for(&tab_id)) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Close task-owned views even when their pane and saved session are gone.
/// Project-owned agent views are shared between tasks and remain open.
#[tauri::command]
pub fn browser_close_task(app: AppHandle, task_id: String) -> Result<(), String> {
    let Some(window) = app.get_window(HOST_WINDOW) else {
        return Ok(());
    };
    for webview in window.webviews() {
        if owns_task_tab(webview.label(), &task_id) {
            webview.close().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn owns_task_tab(label: &str, task_id: &str) -> bool {
    let base = format!("browser:task-{task_id}");
    label == base || label.starts_with(&format!("{base}-"))
}

/// Close every tab belonging to a project, called when the project is removed so
/// its native views do not outlive it. Tab ids are `<project>:<uuid>`, so the
/// project's views all share the `browser:<project>:` label prefix.
#[tauri::command]
pub fn browser_close_project(app: AppHandle, project: String) -> Result<(), String> {
    let Some(window) = app.get_window(HOST_WINDOW) else {
        return Ok(());
    };
    let prefix = format!("browser:{project}:");
    for webview in window.webviews() {
        if webview.label().starts_with(&prefix) {
            let _ = webview.close();
        }
    }
    Ok(())
}

fn set_bounds(
    app: &AppHandle,
    tab_id: &str,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let webview = app
        .get_webview(&label_for(tab_id))
        .ok_or_else(|| "no such browser tab".to_string())?;
    webview
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    webview
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

fn eval(app: &AppHandle, tab_id: &str, js: &str) -> Result<(), String> {
    let webview = app
        .get_webview(&label_for(tab_id))
        .ok_or_else(|| "no such browser tab".to_string())?;
    webview.eval(js).map_err(|e| e.to_string())
}

/// `Webview::reload` maps to `WKWebView.reload`, which may still serve a
/// cached response; a local dev server needs a real refetch to show new
/// content, so this reaches into the native view for `reloadFromOrigin`.
#[cfg(target_os = "macos")]
fn reload_from_origin(webview: &Webview) -> Result<(), String> {
    webview
        .with_webview(|platform| {
            if let Some(wk) = adopt_wk_webview(platform) {
                let _ = unsafe { wk.reloadFromOrigin() };
            }
        })
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
fn reload_from_origin(webview: &Webview) -> Result<(), String> {
    webview.reload().map_err(|e| e.to_string())
}

/// tauri-runtime-wry 2.11 hands `with_webview` +1-retained raw pointers and
/// never releases them; this takes ownership of all three so each call is
/// balanced. Re-check `WebviewMessage::WithWebview` on a Tauri upgrade.
#[cfg(target_os = "macos")]
pub(crate) fn adopt_wk_webview(
    platform: tauri::webview::PlatformWebview,
) -> Option<objc2::rc::Retained<objc2_web_kit::WKWebView>> {
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;

    unsafe {
        drop(Retained::<AnyObject>::from_raw(
            platform.controller().cast(),
        ));
        drop(Retained::<AnyObject>::from_raw(platform.ns_window().cast()));
        Retained::from_raw(platform.inner().cast())
    }
}

#[cfg(test)]
mod tests {
    use super::owns_task_tab;

    #[test]
    fn task_cleanup_closes_only_its_own_views_and_preserves_project_agent_views() {
        assert!(owns_task_tab("browser:task-t_one", "t_one"));
        assert!(owns_task_tab("browser:task-t_one-2", "t_one"));
        assert!(!owns_task_tab("browser:task-t_oneness", "t_one"));
        assert!(!owns_task_tab("browser:task-t_other-2", "t_one"));
        assert!(!owns_task_tab("browser:demo:agent", "t_one"));
        assert!(!owns_task_tab("main", "t_one"));
    }
}
