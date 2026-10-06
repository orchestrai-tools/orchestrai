//! Which web origins may open the daemon's WebSocket. Browsers attach an
//! `Origin` header to every WebSocket handshake and do not apply CORS to it,
//! so without this check any page the user visits could reach the daemon.

use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::{header::ORIGIN, StatusCode};

/// The packaged app's webview: `tauri://localhost` on macOS and Linux,
/// `http(s)://tauri.localhost` on Windows (tauri `protocol::origin`).
const APP_ORIGINS: &[&str] = if cfg!(windows) {
    &["http://tauri.localhost", "https://tauri.localhost"]
} else {
    &["tauri://localhost"]
};

/// The Vite dev servers: the window's (`desktop-next/vite.config.ts`, 5174)
/// and the previous frontend's (`desktop/vite.config.ts`, 5173).
const VITE_ORIGINS: [&str; 4] = [
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
];

/// Comma-separated origins that replace [`VITE_ORIGINS`] when set.
const DEV_ORIGINS_ENV: &str = "ORCHESTRAI_DEV_ORIGINS";

#[derive(Debug, Clone)]
pub(super) struct OriginPolicy {
    dev_origins: Vec<String>,
}

impl OriginPolicy {
    /// Every daemon, whatever its build, accepts the Vite origins: `tauri dev`
    /// loads the UI from Vite and reuses whichever daemon it finds, and a
    /// daemon with a token still refuses a page that cannot read `daemon.json`.
    /// @param _dev whether the daemon runs with `--dev`; the list is the same
    /// @returns the policy for this process
    pub(super) fn new(_dev: bool) -> Self {
        Self {
            dev_origins: dev_origins(std::env::var(DEV_ORIGINS_ENV).ok().as_deref()),
        }
    }

    /// Handshake callback for `accept_hdr_async`: 403 for a refused origin.
    /// @param request the client's upgrade request
    /// @param response the response tungstenite would send
    /// @returns the response unchanged, or a 403 error response
    // The error type is fixed by tungstenite's handshake `Callback`.
    #[allow(clippy::result_large_err)]
    pub(super) fn check(
        &self,
        request: &Request,
        response: Response,
    ) -> Result<Response, ErrorResponse> {
        let allowed = match request.headers().get(ORIGIN).map(|value| value.to_str()) {
            None => true,
            Some(Ok(origin)) => origin_allowed(Some(origin), &self.dev_origins),
            Some(Err(_)) => false,
        };
        if allowed {
            return Ok(response);
        }
        let mut refused = ErrorResponse::new(Some("origin not allowed".into()));
        *refused.status_mut() = StatusCode::FORBIDDEN;
        Err(refused)
    }
}

fn dev_origins(env: Option<&str>) -> Vec<String> {
    match env {
        Some(list) => list
            .split(',')
            .map(|origin| origin.trim().trim_end_matches('/').to_string())
            .filter(|origin| !origin.is_empty())
            .collect(),
        None => VITE_ORIGINS
            .iter()
            .map(|origin| origin.to_string())
            .collect(),
    }
}

/// Whether a handshake carrying `origin` may connect.
/// A missing header is a non-browser client (TUI, MCP bridge, tests).
/// @param origin the request's `Origin` header, if any
/// @param dev_origins extra origins this daemon accepts
/// @returns true when the connection may proceed
pub(super) fn origin_allowed(origin: Option<&str>, dev_origins: &[String]) -> bool {
    let Some(origin) = origin else {
        return true;
    };
    APP_ORIGINS
        .iter()
        .copied()
        .chain(dev_origins.iter().map(String::as_str))
        .any(|allowed| allowed.eq_ignore_ascii_case(origin))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vite() -> Vec<String> {
        dev_origins(None)
    }

    #[test]
    fn non_browser_clients_and_the_app_are_always_allowed() {
        assert!(origin_allowed(None, &[]));
        for origin in APP_ORIGINS {
            assert!(origin_allowed(Some(origin), &[]), "{origin}");
        }
    }

    #[cfg(not(windows))]
    #[test]
    fn the_windows_webview_origins_are_refused_elsewhere() {
        assert!(origin_allowed(Some("tauri://localhost"), &[]));
        for origin in ["http://tauri.localhost", "https://tauri.localhost"] {
            assert!(!origin_allowed(Some(origin), &vite()), "{origin}");
        }
    }

    #[test]
    fn every_daemon_accepts_the_vite_server_unless_the_env_replaces_it() {
        let policy = OriginPolicy::new(false);
        let expected = dev_origins(std::env::var(DEV_ORIGINS_ENV).ok().as_deref());
        assert_eq!(policy.dev_origins, expected);
        assert_eq!(OriginPolicy::new(true).dev_origins, expected);
    }

    #[test]
    fn the_vite_server_is_allowed_only_with_dev_origins() {
        for origin in VITE_ORIGINS {
            assert!(origin_allowed(Some(origin), &vite()), "{origin}");
            assert!(!origin_allowed(Some(origin), &[]), "{origin}");
        }
    }

    #[test]
    fn other_pages_are_refused_even_in_dev() {
        for origin in [
            "https://evil.example",
            "http://localhost:3000",
            "http://localhost:5173.evil.example",
            "http://localhost",
            "null",
            "",
        ] {
            assert!(!origin_allowed(Some(origin), &vite()), "{origin}");
        }
    }

    #[test]
    fn the_env_list_replaces_the_vite_defaults() {
        let custom = dev_origins(Some(" http://localhost:6000/ , ,http://[::1]:6000"));
        assert_eq!(custom, ["http://localhost:6000", "http://[::1]:6000"]);
        assert!(origin_allowed(Some("http://localhost:6000"), &custom));
        assert!(!origin_allowed(Some("http://localhost:5173"), &custom));
    }

    #[test]
    fn a_refused_handshake_answers_403() {
        let policy = OriginPolicy {
            dev_origins: vite(),
        };
        let request = |origin: &str| {
            Request::builder()
                .uri("ws://127.0.0.1:61814/")
                .header(ORIGIN, origin)
                .body(())
                .unwrap()
        };
        let refused = policy
            .check(&request("https://evil.example"), Response::new(()))
            .unwrap_err();
        assert_eq!(refused.status(), StatusCode::FORBIDDEN);
        assert!(policy
            .check(&request("http://localhost:5173"), Response::new(()))
            .is_ok());
    }
}
