use std::{fs, time::{SystemTime, UNIX_EPOCH}};

use tauri::{AppHandle, Manager};

use crate::error::AppResult;

pub const APP_LOG_FILE: &str = "openwhoop-app.log";
pub const APP_LOG_ARCHIVE_FILE: &str = "openwhoop-app.log.1";
pub const APP_LOG_MAX_BYTES: u64 = 512 * 1024;

pub const ACTIVE_WHOOP_SCAN_DURATION_SECS: u64 = 12;
pub const SAVED_WHOOP_SCAN_DURATION_SECS: u64 = 15;

pub const WHOOP_STORE_FILE: &str = "whoop-store.json";
pub const WHOOP_DATABASE_FILE: &str = "db.sqlite";

pub const BACKGROUND_SYNC_INTERVAL_SECS: u64 = 60;
pub const BACKGROUND_SYNC_RETRY_INTERVAL_SECS: u64 = 15;
pub const BACKGROUND_SYNC_POLL_INTERVAL_MS: u64 = 250;
pub const BACKGROUND_SYNC_IDLE_TIMEOUT_SECS: u64 = 20;

pub fn normalize_whoop_address(address: &str) -> Result<String, String> {
    let trimmed_address = address.trim();

    if trimmed_address.is_empty() {
        return Err("WHOOP address cannot be empty".to_owned());
    }

    Ok(trimmed_address.to_ascii_uppercase())
}

pub fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .and_then(|duration| u64::try_from(duration.as_millis()).ok())
        .unwrap_or_default()
}

pub fn whoop_database_url(app: &AppHandle) -> AppResult<String> {
    let database_path = app_data_dir(app)?.join(WHOOP_DATABASE_FILE);
    Ok(format!("sqlite://{}?mode=rwc", database_path.display()))
}

pub fn app_data_dir(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    let app_data_dir = app.path().app_data_dir()?;
    fs::create_dir_all(&app_data_dir)?;
    Ok(app_data_dir)
}

pub fn whoop_store_path(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    Ok(app_data_dir(app)?.join(WHOOP_STORE_FILE))
}
