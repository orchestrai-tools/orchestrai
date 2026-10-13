//! Wry's macOS URL getter unwraps a nil WKWebView.URL after an initial failure.
//! Read the nullable native value safely from a worker, with a bounded wait.

use tauri::{Url, Webview};

#[cfg(target_os = "macos")]
pub(crate) fn current_url(webview: &Webview) -> Result<Option<Url>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    webview
        .with_webview(move |platform| {
            let value = super::adopt_wk_webview(platform)
                .ok_or_else(|| "browser view is unavailable".to_string())
                .and_then(|wk| {
                    let raw = unsafe { wk.URL() }
                        .and_then(|url| url.absoluteString())
                        .map(|value| value.to_string());
                    parse_native_url(raw.as_deref())
                });
            let _ = tx.send(value);
        })
        .map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(10))
        .map_err(|_| "browser view did not report its address within 10s".to_string())?
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn current_url(webview: &Webview) -> Result<Option<Url>, String> {
    webview.url().map(Some).map_err(|e| e.to_string())
}

#[cfg(any(target_os = "macos", test))]
fn parse_native_url(raw: Option<&str>) -> Result<Option<Url>, String> {
    raw.filter(|value| !value.is_empty())
        .map(super::parse_url)
        .transpose()
}

#[cfg(test)]
mod tests {
    use super::parse_native_url;

    #[test]
    fn absent_or_empty_native_address_is_an_unloaded_document() {
        assert_eq!(parse_native_url(None).unwrap(), None);
        assert_eq!(parse_native_url(Some("")).unwrap(), None);
    }

    #[test]
    fn malformed_native_address_is_an_error_and_valid_address_is_retained() {
        assert!(parse_native_url(Some("invalid URL")).is_err());
        let url = "http://localhost:4000/?retry=1";
        assert_eq!(parse_native_url(Some(url)).unwrap().unwrap().as_str(), url);
    }
}
