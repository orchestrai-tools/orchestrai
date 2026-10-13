//! An initial failed navigation has no document for WKWebView to reload.

use tauri::Url;

pub(super) fn recovery_target(
    current: Option<&Url>,
    requested: Option<&str>,
) -> Result<Option<Url>, String> {
    if current.is_some_and(|url| url.as_str() != "about:blank") {
        return Ok(None);
    }
    requested
        .filter(|url| !url.is_empty())
        .map(super::parse_url)
        .transpose()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retry_without_a_document_navigates_to_the_requested_page() {
        let target = Url::parse("http://localhost:4000/").unwrap();
        let blank = Url::parse("about:blank").unwrap();
        assert_eq!(
            recovery_target(None, Some(target.as_str())).unwrap(),
            Some(target.clone())
        );
        assert_eq!(
            recovery_target(Some(&blank), Some(target.as_str())).unwrap(),
            Some(target)
        );
    }

    #[test]
    fn a_loaded_or_redirected_page_keeps_its_own_reload_target() {
        let loaded = Url::parse("https://example.com/redirected").unwrap();
        assert_eq!(
            recovery_target(Some(&loaded), Some("http://localhost:4000/")).unwrap(),
            None
        );
    }

    #[test]
    fn retry_validates_its_target_and_allows_legacy_calls_without_one() {
        assert!(recovery_target(None, Some("invalid URL")).is_err());
        assert_eq!(recovery_target(None, None).unwrap(), None);
        assert_eq!(recovery_target(None, Some("")).unwrap(), None);
    }
}
