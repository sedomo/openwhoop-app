use std::{
    fs::{self, OpenOptions},
    io::{ErrorKind, Write},
};

use tauri::AppHandle;

use crate::{
    config::{app_data_dir, now_unix_ms, APP_LOG_ARCHIVE_FILE, APP_LOG_FILE, APP_LOG_MAX_BYTES},
    error::AppResult,
};

#[tauri::command]
pub fn write_frontend_log(
    app: AppHandle,
    level: String,
    scope: String,
    message: String,
) -> Result<(), String> {
    write_app_log(
        &app,
        normalize_log_level(&level),
        &format!("ts.{scope}"),
        &message,
    );
    Ok(())
}

pub fn write_app_log(app: &AppHandle, level: &str, scope: &str, message: &str) {
    let line = format!(
        "[{}][{}][{}] {}\n",
        now_unix_ms(),
        level,
        scope,
        normalized_log_message(message)
    );

    eprint!("{line}");

    let log_path = match app_log_path(app) {
        Ok(path) => path,
        Err(err) => {
            eprintln!(
                "[{}][WARN][logger] Unable to resolve the app log path: {:?}",
                now_unix_ms(),
                err
            );
            return;
        }
    };

    if let Err(err) =
        rotate_app_log_if_needed(&log_path).and_then(|_| append_log_line(&log_path, &line))
    {
        eprintln!(
            "[{}][WARN][logger] Unable to persist app log line: {}",
            now_unix_ms(),
            err
        );
    }
}

pub fn log_info(app: &AppHandle, scope: &str, message: impl AsRef<str>) {
    write_app_log(app, "INFO", scope, message.as_ref());
}

pub fn log_warn(app: &AppHandle, scope: &str, message: impl AsRef<str>) {
    write_app_log(app, "WARN", scope, message.as_ref());
}

pub fn log_error(app: &AppHandle, scope: &str, message: impl AsRef<str>) {
    write_app_log(app, "ERROR", scope, message.as_ref());
}

fn append_log_line(path: &std::path::Path, line: &str) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|err| format!("Unable to open the app log file: {err}"))?;

    file.write_all(line.as_bytes())
        .map_err(|err| format!("Unable to write the app log file: {err}"))
}

pub fn app_log_path(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    Ok(app_data_dir(app)?.join(APP_LOG_FILE))
}

fn normalized_log_message(message: &str) -> String {
    let compact = message
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" | ");

    if compact.is_empty() {
        message.trim().to_owned()
    } else {
        compact
    }
}

fn rotate_app_log_if_needed(path: &std::path::Path) -> Result<(), String> {
    let current_size = match fs::metadata(path) {
        Ok(metadata) => metadata.len(),
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(format!("Unable to read app log metadata: {err}")),
    };

    if current_size < APP_LOG_MAX_BYTES {
        return Ok(());
    }

    let archived_path = path.with_file_name(APP_LOG_ARCHIVE_FILE);

    match fs::remove_file(&archived_path) {
        Ok(()) => {}
        Err(err) if err.kind() == ErrorKind::NotFound => {}
        Err(err) => return Err(format!("Unable to remove archived app log file: {err}")),
    }

    fs::rename(path, archived_path)
        .map_err(|err| format!("Unable to rotate the app log file: {err}"))
}

fn normalize_log_level(level: &str) -> &'static str {
    match level.trim().to_ascii_lowercase().as_str() {
        "debug" => "DEBUG",
        "warn" => "WARN",
        "error" => "ERROR",
        _ => "INFO",
    }
}
