mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::app_version,
            commands::window_state::save_window_geometry,
            commands::window_state::load_window_geometry
        ])
        .setup(|app| {
            // Restore the saved window geometry before the window is shown so it
            // opens at its previous size/position without a visible jump.
            commands::window_state::restore(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
