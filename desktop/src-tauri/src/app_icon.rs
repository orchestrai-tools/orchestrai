//! The icon a person picks in Settings › Appearance. macOS shows it in the
//! Dock and the app switcher while the app runs; Finder and Launchpad keep the
//! bundle icon, since a signed bundle cannot rewrite its own `icon.icns`.
//! Windows and Linux put it on the main window.

use tauri::AppHandle;

const ICONS: &[(&str, &[u8])] = &[
    ("back", include_bytes!("../icons/app-icons/back.png")),
    ("front", include_bytes!("../icons/app-icons/front.png")),
    ("line", include_bytes!("../icons/app-icons/line.png")),
    ("ai", include_bytes!("../icons/app-icons/ai.png")),
];

fn icon_bytes(name: &str) -> Option<&'static [u8]> {
    ICONS
        .iter()
        .find(|(id, _)| *id == name)
        .map(|(_, bytes)| *bytes)
}

#[tauri::command]
pub fn set_app_icon(app: AppHandle, name: String) -> Result<(), String> {
    let bytes = icon_bytes(&name).ok_or_else(|| format!("unknown app icon: {name}"))?;
    #[cfg(target_os = "macos")]
    app.run_on_main_thread(move || set_dock_icon(bytes))
        .map_err(|error| error.to_string())?;
    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let image = tauri::image::Image::from_bytes(bytes).map_err(|e| e.to_string())?;
            window.set_icon(image).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn set_dock_icon(bytes: &'static [u8]) {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let data = NSData::with_bytes(bytes);
    let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) else {
        return;
    };
    // SAFETY: on the main thread, with an image AppKit just decoded.
    unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image)) };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_icon_is_a_png() {
        for (name, bytes) in ICONS {
            assert!(bytes.starts_with(b"\x89PNG"), "{name} is not a PNG");
        }
    }

    #[test]
    fn unknown_names_have_no_icon() {
        assert!(icon_bytes("back").is_some());
        assert!(icon_bytes("nope").is_none());
    }
}
