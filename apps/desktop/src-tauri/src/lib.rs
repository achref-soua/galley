//! Galley desktop shell (Tauri 2).
//!
//! Bootstrap glue only: it builds the Tauri application, titles the window from
//! `galley_core`, and hands control to the OS event loop. No testable business
//! logic lives here — that belongs in the `galley-*` crates — so this file is
//! excluded from coverage (see `docs/adr/0002`).

use tauri::Manager;

/// Build and run the Galley desktop application.
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let title = format!("{} {}", galley_core::NAME, galley_core::VERSION);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_title(&title);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running the Galley application");
}
