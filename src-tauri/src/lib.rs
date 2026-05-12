#[macro_use]
extern crate serde;

mod config;
mod error;
mod handlers;
mod internals;
mod state;

use crate::{
    config::{now_unix_ms, whoop_database_url},
    handlers::*,
    state::{AppState, DatabaseState},
};
use openwhoop::db::DatabaseHandler;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let database = tauri::async_runtime::block_on(DatabaseHandler::new(
                whoop_database_url(&handle).unwrap(),
            ));
            app.manage(DatabaseState::new(database));

            match app_log_path(&handle) {
                Ok(path) => log_info(
                    &handle,
                    "app.boot",
                    format!("Logger ready. Persisting logs to {}.", path.display()),
                ),
                Err(err) => eprintln!(
                    "[{}][WARN][app.boot] Unable to resolve the app log path: {:?}",
                    now_unix_ms(),
                    err
                ),
            }

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_blec::init())
        .invoke_handler(tauri::generate_handler![
            database::export_database_copy,
            database::start_import_database_sync,
            database::get_import_sync_status,
            activity::get_activity_types,
            activity::create_activity,
            activity::update_activity,
            activity::delete_activity,
            log::write_frontend_log,
            ble_permissions::tauri_blec_check_permissions,
            scan::scan_whoops,
            selection::get_whoop_selection_state,
            sync::get_background_sync_status,
            runtime::get_saved_whoop_runtime_status,
            daily_info::get_daily_info,
            daily_info::get_latest_daily_stats,
            daily_info::get_last_7_day_daily_stats_average,
            latest_reading::get_latest_reading_label,
            latest_reading::get_earliest_reading_time,
            hr_stream::get_heart_rate_stream_status,
            hr_stream::start_heart_rate_stream,
            hr_stream::stop_heart_rate_stream,
            stress_stream::get_stress_stream_status,
            stress_stream::start_stress_stream,
            stress_stream::stop_stress_stream,
            whoop_manager::reboot_whoop_device,
            whoop_manager::erase_whoop_device_data,
            whoop_manager::connect_to_whoop,
            whoop_manager::connect_to_saved_whoop,
            whoop_manager::get_debug_packets,
            whoop_manager::set_debug_packets,
            whoop_manager::clear_selected_whoop_address
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
