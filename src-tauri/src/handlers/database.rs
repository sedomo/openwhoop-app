use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};

use openwhoop::db::{sync::DatabaseSync, DatabaseHandler};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_fs::{FsExt, OpenOptions};

use crate::{
    config::{app_data_dir, now_unix_ms, WHOOP_DATABASE_FILE},
    error::{AppError, AppResult},
    handlers::{log_error, log_info},
    state::{AppState, DatabaseState},
};

#[derive(Default)]
pub struct ImportSyncController {
    task: Option<tauri::async_runtime::JoinHandle<()>>,
    should_exit: Option<Arc<AtomicBool>>,
    running: bool,
    stage: String,
    source_label: Option<String>,
    started_at_ms: Option<u64>,
    finished_at_ms: Option<u64>,
    last_success_at_ms: Option<u64>,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSyncStatus {
    running: bool,
    stage: String,
    source_label: Option<String>,
    started_at_ms: Option<u64>,
    finished_at_ms: Option<u64>,
    last_success_at_ms: Option<u64>,
    last_error: Option<String>,
}

fn database_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_dir(app)?.join(WHOOP_DATABASE_FILE))
}

fn imported_database_copy_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app_data_dir(app)?.join("import-source.sqlite"))
}

fn sqlite_url(path: &Path) -> String {
    format!("sqlite://{}?mode=rwc", path.display())
}

fn import_status_snapshot(state: &AppState) -> AppResult<ImportSyncStatus> {
    state.get_import_sync_controller(|controller| ImportSyncStatus {
        running: controller.running,
        stage: controller.stage.clone(),
        source_label: controller.source_label.clone(),
        started_at_ms: controller.started_at_ms,
        finished_at_ms: controller.finished_at_ms,
        last_success_at_ms: controller.last_success_at_ms,
        last_error: controller.last_error.clone(),
    })
}

#[tauri::command]
pub fn get_import_sync_status(state: tauri::State<'_, AppState>) -> AppResult<ImportSyncStatus> {
    import_status_snapshot(state.inner())
}

#[tauri::command]
pub fn export_database_copy(app: AppHandle) -> AppResult<Option<String>> {
    let source_path = database_path(&app)?;

    if !source_path.exists() {
        return Err("Database file does not exist yet.".into());
    }

    let Some(target_file) = app
        .dialog()
        .file()
        .add_filter("SQLite database", &["sqlite", "db"])
        .set_file_name(WHOOP_DATABASE_FILE)
        .blocking_save_file()
    else {
        return Ok(None);
    };

    let mut source = fs::File::open(&source_path)?;

    let exported_location = match &target_file {
        tauri_plugin_fs::FilePath::Path(target_path) => {
            let mut target = fs::File::create(target_path)?;
            io::copy(&mut source, &mut target)?;
            target.sync_all()?;
            target_path.display().to_string()
        }
        tauri_plugin_fs::FilePath::Url(target_url) => {
            let mut options = OpenOptions::new();
            options.write(true).truncate(true).create(true);
            let mut target = app.fs().open(target_url.clone(), options)?;
            io::copy(&mut source, &mut target)?;
            target.sync_all()?;
            target_url.to_string()
        }
    };

    Ok(Some(exported_location))
}

#[tauri::command]
pub fn start_import_database_sync(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    database_state: tauri::State<'_, DatabaseState>,
) -> AppResult<bool> {
    if state.get_import_sync_controller(|controller| controller.running)? {
        return Err(AppError::from("An import sync is already running."));
    }

    let Some(source_file) = app
        .dialog()
        .file()
        .add_filter("SQLite database", &["sqlite", "db"])
        .blocking_pick_file()
    else {
        return Ok(false);
    };

    let source_label = source_file.to_string();
    let started_at_ms = now_unix_ms();
    let should_exit = Arc::new(AtomicBool::new(false));

    state.update_import_sync_controller(|controller| {
        controller.running = true;
        controller.stage = "Preparing import".to_owned();
        controller.source_label = Some(source_label.clone());
        controller.started_at_ms = Some(started_at_ms);
        controller.finished_at_ms = None;
        controller.last_error = None;
        controller.should_exit = Some(should_exit.clone());
    })?;

    let app_handle = app.clone();
    let db_handle = database_state.database();
    let task = tauri::async_runtime::spawn(async move {
        run_import_sync_task(app_handle, db_handle, source_file, should_exit).await;
    });

    state.update_import_sync_controller(|controller| {
        controller.task = Some(task);
    })?;

    Ok(true)
}

async fn run_import_sync_task(
    app: AppHandle,
    database: DatabaseHandler,
    source_file: tauri_plugin_fs::FilePath,
    should_exit: Arc<AtomicBool>,
) {
    let result = run_import_sync_inner(&app, database, source_file, should_exit).await;
    let finished_at_ms = now_unix_ms();
    let success = result.is_ok();
    let error_message = result.as_ref().err().cloned();
    let state = app.state::<AppState>();

    let _ = state.update_import_sync_controller(|controller| {
        controller.running = false;
        controller.finished_at_ms = Some(finished_at_ms);
        controller.should_exit = None;
        controller.task = None;

        if success {
            controller.stage = "Import complete".to_owned();
            controller.last_success_at_ms = Some(finished_at_ms);
            controller.last_error = None;
        } else {
            controller.stage = "Import failed".to_owned();
            controller.last_error = error_message.clone();
        }
    });

    if let Err(error) = result {
        log_error(&app, "database.import", error);
    }
}

async fn run_import_sync_inner(
    app: &AppHandle,
    database: DatabaseHandler,
    source_file: tauri_plugin_fs::FilePath,
    should_exit: Arc<AtomicBool>,
) -> Result<(), String> {
    let state = app.state::<AppState>();

    if should_exit.load(Ordering::SeqCst) {
        return Err("Import sync was cancelled.".to_owned());
    }

    state
        .update_import_sync_controller(|controller| {
            controller.stage = "Copying selected database".to_owned();
        })
        .map_err(String::from)?;

    let import_copy_path = imported_database_copy_path(app).map_err(String::from)?;
    let mut source_options = OpenOptions::new();
    source_options.read(true);
    let mut source = app
        .fs()
        .open(source_file.clone(), source_options)
        .map_err(|err| format!("Unable to open selected database: {err}"))?;
    let mut import_copy = fs::File::create(&import_copy_path)
        .map_err(|err| format!("Unable to prepare import database copy: {err}"))?;
    io::copy(&mut source, &mut import_copy)
        .map_err(|err| format!("Unable to copy selected database: {err}"))?;
    import_copy
        .sync_all()
        .map_err(|err| format!("Unable to flush imported database copy: {err}"))?;

    if should_exit.load(Ordering::SeqCst) {
        return Err("Import sync was cancelled.".to_owned());
    }

    state
        .update_import_sync_controller(|controller| {
            controller.stage = "Syncing into internal database".to_owned();
        })
        .map_err(String::from)?;

    let remote_db = DatabaseHandler::new(sqlite_url(&import_copy_path)).await;
    let sync = DatabaseSync::new(database.connection(), remote_db.connection());
    sync.run()
        .await
        .map_err(|err| format!("Unable to sync imported database: {err}"))?;

    log_info(
        app,
        "database.import",
        format!("Imported database from {}.", source_file),
    );

    Ok(())
}
