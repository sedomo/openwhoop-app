use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use openwhoop::{
    ble::tauri_blec::TauriBlecTransport, db::DatabaseHandler, HistorySyncConfig, OpenWhoop,
    WhoopDeviceWith,
};
use openwhoop_codec::{constants::WhoopGeneration, WhoopPacket};
use tauri::{AppHandle, Manager};

use crate::{
    config::{
        normalize_whoop_address, BACKGROUND_SYNC_IDLE_TIMEOUT_SECS, BACKGROUND_SYNC_INTERVAL_SECS,
        BACKGROUND_SYNC_RETRY_INTERVAL_SECS,
    },
    error::AppResult,
    handlers::{
        log_info, log_warn, wait_for_stop_signal, whoop_manager::read_persisted_whoop_store,
    },
    internals::ensure_connected_saved_whoop,
    now_unix_ms,
    state::DatabaseState,
    AppState,
};

const STRAIN_REFRESH_INTERVAL_SECS: u64 = 30 * 60;

pub struct BackgroundSyncController {
    task: Option<tauri::async_runtime::JoinHandle<()>>,
    should_exit: Option<Arc<AtomicBool>>,
    running: bool,
    device_address: Option<String>,
    last_started_at_ms: Option<u64>,
    last_finished_at_ms: Option<u64>,
    last_success_at_ms: Option<u64>,
    last_error: Option<String>,
}

impl Default for BackgroundSyncController {
    fn default() -> Self {
        Self {
            task: None,
            should_exit: None,
            running: false,
            device_address: None,
            last_started_at_ms: None,
            last_finished_at_ms: None,
            last_success_at_ms: None,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundSyncStatus {
    running: bool,
    device_address: Option<String>,
    last_started_at_ms: Option<u64>,
    last_finished_at_ms: Option<u64>,
    last_success_at_ms: Option<u64>,
    last_error: Option<String>,
    sync_interval_secs: u64,
    retry_interval_secs: u64,
}

#[tauri::command]
pub fn get_background_sync_status(
    state: tauri::State<'_, AppState>,
) -> AppResult<BackgroundSyncStatus> {
    background_sync_status_snapshot(state.inner())
}

pub async fn start_background_sync(
    app: &AppHandle,
    state: &AppState,
    address: String,
    generation: WhoopGeneration,
) -> AppResult<BackgroundSyncStatus> {
    let normalized_address = normalize_whoop_address(&address)?;

    {
        let (running, device_address) =
            state.get_background_sync_controller(|c| (c.running, c.device_address.clone()))?;

        if running
            && device_address
                .as_deref()
                .is_some_and(|current| current.eq_ignore_ascii_case(&normalized_address))
        {
            log_info(
                app,
                "background_sync",
                format!("Background sync already running for address={normalized_address}"),
            );
            return background_sync_status_snapshot(state);
        }
    }

    stop_background_sync(state).await?;

    let should_exit = Arc::new(AtomicBool::new(false));
    let started_at_ms = now_unix_ms();

    app.state::<AppState>()
        .update_background_sync_controller(|controller| {
            controller.running = true;
            controller.device_address = Some(normalized_address.clone());
            controller.last_started_at_ms = Some(started_at_ms);
            controller.last_error = None;
            controller.should_exit = Some(should_exit.clone());
        })?;
    log_info(
        app,
        "background_sync",
        format!(
            "Background sync started address={} generation={}",
            normalized_address, generation
        ),
    );

    let app_handle = app.clone();
    let task_address = normalized_address.clone();
    let task_should_exit = should_exit.clone();
    let task = tauri::async_runtime::spawn_blocking(move || {
        tauri::async_runtime::block_on(async move {
            run_background_sync_task(app_handle, task_address, generation, task_should_exit).await;
        });
    });

    app.state::<AppState>()
        .update_background_sync_controller(move |controller| {
            controller.task = Some(task);
        })?;

    background_sync_status_snapshot(state)
}

async fn run_background_sync_task(
    app: AppHandle,
    address: String,
    generation: WhoopGeneration,
    should_exit: Arc<AtomicBool>,
) {
    let mut last_strain_refresh_at_ms: Option<u64> = None;

    loop {
        if should_exit.load(Ordering::SeqCst) {
            break;
        }

        log_info(
            &app,
            "background_sync",
            format!(
                "Starting background sync cycle address={} generation={}",
                address, generation
            ),
        );
        let app_state = app.state::<AppState>();
        let cycle_result = match ensure_connected_saved_whoop(&address).await {
            Ok(()) => {
                run_background_sync_cycle(
                    app_state.inner(),
                    &app,
                    app.state::<DatabaseState>().inner(),
                    generation,
                    should_exit.clone(),
                    &mut last_strain_refresh_at_ms,
                )
                .await
            }
            Err(error) => Err(error),
        };

        let finished_at_ms = now_unix_ms();
        let sleep_duration = if cycle_result.is_ok() {
            Duration::from_secs(BACKGROUND_SYNC_INTERVAL_SECS)
        } else {
            Duration::from_secs(BACKGROUND_SYNC_RETRY_INTERVAL_SECS)
        };

        match &cycle_result {
            Ok(()) => log_info(
                &app,
                "background_sync",
                format!(
                    "Background sync cycle completed successfully. Next sync in {}s.",
                    BACKGROUND_SYNC_INTERVAL_SECS
                ),
            ),
            Err(error) => log_warn(
                &app,
                "background_sync",
                format!(
                    "Background sync cycle failed: {}. Retrying in {}s.",
                    error, BACKGROUND_SYNC_RETRY_INTERVAL_SECS
                ),
            ),
        }

        let _ = app
            .state::<AppState>()
            .update_background_sync_controller(|controller| {
                controller.last_finished_at_ms = Some(finished_at_ms);

                match &cycle_result {
                    Ok(()) => {
                        controller.last_success_at_ms = Some(finished_at_ms);
                        controller.last_error = None;
                    }
                    Err(error) => {
                        controller.last_error = Some(error.clone());
                    }
                }
            });

        if should_exit.load(Ordering::SeqCst) {
            break;
        }

        wait_for_stop_signal(sleep_duration, should_exit.as_ref()).await;
    }

    let _ = app
        .state::<AppState>()
        .update_background_sync_controller(|controller| {
            controller.running = false;
            controller.task = None;
            controller.should_exit = None;
        });
}

async fn run_background_sync_cycle(
    state: &AppState,
    app: &AppHandle,
    database_state: &DatabaseState,
    generation: WhoopGeneration,
    should_exit: Arc<AtomicBool>,
    last_strain_refresh_at_ms: &mut Option<u64>,
) -> Result<(), String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|err| err.to_string())?;
    let transport = TauriBlecTransport::connected(handler);
    let database = database_state.database();
    let debug_packets = read_persisted_whoop_store(app)
        .map(|store| store.debug_packets)
        .unwrap_or(false);
    let mut whoop =
        WhoopDeviceWith::from_transport(transport, database.clone(), debug_packets, generation);

    whoop
        .connect()
        .await
        .map_err(|err| format!("WHOOP connected, but transport setup failed: {err}"))?;

    if let Err(err) = whoop.initialize().await {
        unsubscribe_sync_characteristics(state, handler, generation).await;
        return Err(format!("WHOOP connected, but initialization failed: {err}"));
    }

    let sync_result = whoop
        .sync_history(
            should_exit,
            HistorySyncConfig::from_secs(0, BACKGROUND_SYNC_IDLE_TIMEOUT_SECS),
        )
        .await
        .map_err(|err| format!("History sync failed: {err}"));

    let sync_result = match sync_result {
        Ok(()) => OpenWhoop::new(database.clone(), WhoopGeneration::Placeholder)
            .detect_sleeps()
            .await
            .map_err(|err| format!("Sleep detection failed: {err}")),
        Err(err) => Err(err),
    };

    let sync_result = match sync_result {
        Ok(()) => OpenWhoop::new(database.clone(), WhoopGeneration::Placeholder)
            .detect_events()
            .await
            .map_err(|err| format!("Event detection failed: {err}")),
        Err(err) => Err(err),
    };

    let sync_result = match sync_result {
        Ok(()) => OpenWhoop::new(database.clone(), WhoopGeneration::Placeholder)
            .calculate_stress()
            .await
            .map_err(|err| format!("Stress detection failed: {err}")),
        Err(err) => Err(err),
    };

    let sync_result = match sync_result {
        Ok(()) => maybe_refresh_strain(app, database, last_strain_refresh_at_ms).await,
        Err(err) => Err(err),
    };

    if matches!(generation, WhoopGeneration::Gen4) {
        if let Ok(true) = whoop.is_connected().await {
            let _ = whoop.send_command(WhoopPacket::exit_high_freq_sync()).await;
        }
    }

    unsubscribe_sync_characteristics(state, handler, generation).await;
    sync_result
}

async fn maybe_refresh_strain(
    app: &AppHandle,
    database: DatabaseHandler,
    last_strain_refresh_at_ms: &mut Option<u64>,
) -> Result<(), String> {
    let now_ms = now_unix_ms();
    let should_refresh = last_strain_refresh_at_ms
        .is_none_or(|last| now_ms.saturating_sub(last) >= STRAIN_REFRESH_INTERVAL_SECS * 1000);

    if !should_refresh {
        return Ok(());
    }

    OpenWhoop::new(database, WhoopGeneration::Placeholder)
        .calculate_latest_strain()
        .await
        .map_err(|err| format!("Strain calculation failed: {err}"))?;

    *last_strain_refresh_at_ms = Some(now_ms);
    log_info(
        app,
        "background_sync",
        format!(
            "Calculated latest strain. Next refresh in {}s.",
            STRAIN_REFRESH_INTERVAL_SECS
        ),
    );

    Ok(())
}

pub async fn stop_background_sync(state: &AppState) -> AppResult<()> {
    let task = state.update_background_sync_controller(|controller| {
        if let Some(should_exit) = &controller.should_exit {
            should_exit.store(true, Ordering::SeqCst);
        }

        controller.should_exit = None;
        controller.task.take()
    })?;

    if let Some(task) = task {
        let _ = task.await;
    }

    Ok(())
}

async fn unsubscribe_sync_characteristics(
    state: &AppState,
    handler: &'static tauri_plugin_blec::Handler,
    generation: WhoopGeneration,
) {
    let keep_realtime_channels = state.has_active_realtime_stream().unwrap_or(false);

    let mut characteristics = vec![generation.events_from_strap(), generation.memfault()];
    if !keep_realtime_channels {
        characteristics.push(generation.data_from_strap());
        characteristics.push(generation.cmd_from_strap());
    }

    for characteristic in characteristics {
        let _ = handler.unsubscribe(characteristic).await;
    }
}

pub fn background_sync_status_snapshot(state: &AppState) -> AppResult<BackgroundSyncStatus> {
    state.get_background_sync_controller(|controller| BackgroundSyncStatus {
        running: controller.running,
        device_address: controller.device_address.clone(),
        last_started_at_ms: controller.last_started_at_ms,
        last_finished_at_ms: controller.last_finished_at_ms,
        last_success_at_ms: controller.last_success_at_ms,
        last_error: controller.last_error.clone(),
        sync_interval_secs: BACKGROUND_SYNC_INTERVAL_SECS,
        retry_interval_secs: BACKGROUND_SYNC_RETRY_INTERVAL_SECS,
    })
}
