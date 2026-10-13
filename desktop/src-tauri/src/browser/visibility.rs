//! Reopening a tab preserves its document while restoring its pane visibility.

use tauri::{LogicalPosition, LogicalSize, Url, Webview};

trait TabSurface {
    fn navigate(&self, target: Url) -> Result<(), String>;
    fn place(&self, bounds: (f64, f64, f64, f64)) -> Result<(), String>;
    fn set_visible(&self, visible: bool) -> Result<(), String>;
}

impl TabSurface for Webview {
    fn navigate(&self, target: Url) -> Result<(), String> {
        Webview::navigate(self, target).map_err(|e| e.to_string())
    }

    fn place(&self, (x, y, width, height): (f64, f64, f64, f64)) -> Result<(), String> {
        self.set_position(LogicalPosition::new(x, y))
            .map_err(|e| e.to_string())?;
        self.set_size(LogicalSize::new(width, height))
            .map_err(|e| e.to_string())
    }

    fn set_visible(&self, visible: bool) -> Result<(), String> {
        if visible { self.show() } else { self.hide() }.map_err(|e| e.to_string())
    }
}

pub(super) fn restore(
    tab: &Webview,
    target: Url,
    bounds: (f64, f64, f64, f64),
    reuse: bool,
    hidden: bool,
) -> Result<(), String> {
    restore_surface(tab, target, bounds, reuse, hidden)
}

fn restore_surface(
    tab: &impl TabSurface,
    target: Url,
    bounds: (f64, f64, f64, f64),
    reuse: bool,
    hidden: bool,
) -> Result<(), String> {
    if !reuse {
        tab.navigate(target)?;
    }
    tab.place(bounds)?;
    tab.set_visible(!hidden)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[derive(Default)]
    struct Surface {
        navigations: RefCell<Vec<Url>>,
        bounds: RefCell<Option<(f64, f64, f64, f64)>>,
        visible: RefCell<bool>,
    }

    impl TabSurface for Surface {
        fn navigate(&self, target: Url) -> Result<(), String> {
            self.navigations.borrow_mut().push(target);
            Ok(())
        }

        fn place(&self, bounds: (f64, f64, f64, f64)) -> Result<(), String> {
            self.bounds.replace(Some(bounds));
            Ok(())
        }

        fn set_visible(&self, visible: bool) -> Result<(), String> {
            self.visible.replace(visible);
            Ok(())
        }
    }

    #[test]
    fn hidden_agent_tab_is_shown_when_adopted_without_reloading_its_document() {
        let tab = Surface::default();
        let page = Url::parse("http://localhost:4000/").unwrap();
        let pane = (100.0, 150.0, 800.0, 600.0);
        restore_surface(&tab, page, pane, true, false).unwrap();
        assert!(*tab.visible.borrow());
        assert_eq!(*tab.bounds.borrow(), Some(pane));
        assert!(tab.navigations.borrow().is_empty());
    }

    #[test]
    fn a_tab_can_be_hidden_and_reopened_without_losing_its_document() {
        let tab = Surface::default();
        let page = Url::parse("http://localhost:4000/").unwrap();
        let pane = (0.0, 0.0, 800.0, 600.0);
        restore_surface(&tab, page.clone(), pane, false, false).unwrap();
        assert!(*tab.visible.borrow());
        restore_surface(&tab, page.clone(), pane, true, true).unwrap();
        assert!(!*tab.visible.borrow());
        restore_surface(&tab, page.clone(), pane, true, false).unwrap();
        assert!(*tab.visible.borrow());
        assert_eq!(*tab.navigations.borrow(), [page]);
    }
}
