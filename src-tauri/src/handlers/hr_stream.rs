use openwhoop_codec::{constants::WhoopGeneration, WhoopData, WhoopPacket};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    error::{AppError, AppResult},
    handlers::{
        log_error, log_info, stress_stream::stop_stress_stream_internal,
        whoop_manager::read_persisted_whoop_store,
    },
    internals::{ensure_connected_saved_whoop, frame_whoop_command},
    now_unix_ms, AppState,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeartRateStreamStatus {
    pub running: bool,
    pub generation: Option<WhoopGeneration>,
    pub last_sample_at_ms: Option<u64>,
    pub last_bpm: Option<u8>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HeartRateSample {
    unix: u32,
    bpm: u8,
    received_at_ms: u64,
}

pub struct HeartRateStreamController {
    running: bool,
    generation: Option<WhoopGeneration>,
    next_seq: u8,
    last_sample_at_ms: Option<u64>,
    last_bpm: Option<u8>,
    last_error: Option<String>,
}

impl Default for HeartRateStreamController {
    fn default() -> Self {
        Self {
            running: false,
            // device_address: None,
            generation: None,
            next_seq: 0,
            last_sample_at_ms: None,
            last_bpm: None,
            last_error: None,
        }
    }
}

impl HeartRateStreamController {
    pub fn is_running(&self) -> bool {
        self.running
    }
}

#[tauri::command]
pub fn get_heart_rate_stream_status(
    state: tauri::State<'_, AppState>,
) -> AppResult<HeartRateStreamStatus> {
    heart_rate_stream_status_snapshot(state.inner())
}

#[tauri::command]
pub async fn start_heart_rate_stream(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<HeartRateStreamStatus> {
    let store = read_persisted_whoop_store(&app)?;
    let Some((address, generation)) = store.whoop_and_generation() else {
        return Err(AppError::from("Whoop device not selected"));
    };

    log_info(
        &app,
        "heart_rate_stream",
        format!(
            "Start heart-rate stream requested address={} generation={}",
            address, generation
        ),
    );

    stop_stress_stream_internal(&app, state.inner()).await?;
    stop_heart_rate_stream_internal(&app, state.inner()).await?;
    ensure_connected_saved_whoop(&address).await?;

    let handler = tauri_plugin_blec::get_handler()?;
    let callback_app = app.clone();
    if let Err(error) = handler
        .subscribe(
            generation.data_from_strap(),
            Some(generation.service()),
            move |bytes: Vec<u8>| handle_heart_rate_notification(&callback_app, generation, bytes),
        )
        .await
        .map_err(|err| err.to_string())
    {
        log_error(
            &app,
            "heart_rate_stream",
            format!("Unable to subscribe to WHOOP HR data characteristic: {error}"),
        );
        return Err(AppError::from(error));
    }

    let callback_app = app.clone();
    if let Err(error) = handler
        .subscribe(
            generation.cmd_from_strap(),
            Some(generation.service()),
            move |bytes: Vec<u8>| handle_heart_rate_notification(&callback_app, generation, bytes),
        )
        .await
        .map_err(|err| err.to_string())
    {
        let _ = handler.unsubscribe(generation.data_from_strap()).await;
        log_error(
            &app,
            "heart_rate_stream",
            format!("Unable to subscribe to WHOOP HR command characteristic: {error}"),
        );
        return Err(AppError::from(error));
    }

    state.inner().update_heart_rate_stream(|controller| {
        controller.running = true;
        controller.generation = Some(generation);
        controller.next_seq = 0;
        controller.last_sample_at_ms = None;
        controller.last_bpm = None;
        controller.last_error = None;
    })?;

    if let Err(error) = send_connected_whoop_command(
        state.inner(),
        generation,
        WhoopPacket::toggle_realtime_hr(true),
    )
    .await
    {
        let _ = handler.unsubscribe(generation.data_from_strap()).await;
        let _ = handler.unsubscribe(generation.cmd_from_strap()).await;

        state.inner().update_heart_rate_stream(|controller| {
            controller.running = false;
            controller.generation = None;
            controller.next_seq = 0;
            controller.last_error = Some(error.clone());
        })?;

        return Err(AppError::from(error));
    }

    log_info(
        &app,
        "heart_rate_stream",
        "Heart-rate stream started successfully.",
    );
    heart_rate_stream_status_snapshot(state.inner())
}

fn next_heart_rate_stream_seq(state: &AppState) -> AppResult<u8> {
    let seq = state.get_heart_rate_stream(|s| s.next_seq)?;
    state.update_heart_rate_stream(|c| c.next_seq = seq.wrapping_add(1))?;
    Ok(seq)
}

pub fn heart_rate_stream_status_snapshot(state: &AppState) -> AppResult<HeartRateStreamStatus> {
    state.get_heart_rate_stream(|controller| HeartRateStreamStatus {
        running: controller.running,
        generation: controller.generation,
        last_sample_at_ms: controller.last_sample_at_ms,
        last_bpm: controller.last_bpm,
        last_error: controller.last_error.clone(),
    })
}

pub(crate) async fn stop_heart_rate_stream_internal(
    app: &AppHandle,
    state: &AppState,
) -> AppResult<HeartRateStreamStatus> {
    let (running, generation) = state.get_heart_rate_stream(|c| (c.running, c.generation))?;

    if !running {
        return heart_rate_stream_status_snapshot(state);
    }

    log_info(
        app,
        "heart_rate_stream",
        "Stopping the live heart-rate stream.",
    );

    if let Some(generation) = generation {
        if let Ok(handler) = tauri_plugin_blec::get_handler() {
            if handler.is_connected() {
                if let Err(error) = send_connected_whoop_command(
                    state,
                    generation,
                    WhoopPacket::toggle_realtime_hr(false),
                )
                .await
                {
                    let _ = state.update_heart_rate_stream(move |controller| {
                        controller.last_error = Some(error);
                    });
                }
            }

            let _ = handler.unsubscribe(generation.data_from_strap()).await;
            let _ = handler.unsubscribe(generation.cmd_from_strap()).await;
        }

        state.update_heart_rate_stream(|controller| {
            controller.running = false;
            controller.generation = None;
            controller.next_seq = 0;
            controller.last_sample_at_ms = None;
            controller.last_bpm = None;
        })?;
    }

    heart_rate_stream_status_snapshot(state)
}

async fn send_connected_whoop_command(
    state: &AppState,
    generation: WhoopGeneration,
    packet: WhoopPacket,
) -> Result<(), String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|err| err.to_string())?;
    let seq = next_heart_rate_stream_seq(state)?;
    let data = frame_whoop_command(packet.with_seq(seq), generation)?;

    handler
        .send_data(
            generation.cmd_to_strap(),
            Some(generation.service()),
            &data,
            tauri_plugin_blec::models::WriteType::WithoutResponse,
        )
        .await
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub async fn stop_heart_rate_stream(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<HeartRateStreamStatus> {
    stop_heart_rate_stream_internal(&app, state.inner())
        .await
        .map(|status| {
            log_info(
                &app,
                "heart_rate_stream",
                "Heart-rate stream stop request completed.",
            );
            status
        })
        .map_err(|err| {
            log_error(
                &app,
                "heart_rate_stream",
                format!("Unable to stop the heart-rate stream: {:?}", err),
            );
            err
        })
}

fn handle_heart_rate_notification(app: &AppHandle, generation: WhoopGeneration, bytes: Vec<u8>) {
    const HEART_RATE_STREAM_EVENT: &str = "heart-rate-stream-sample";

    let packet = match generation {
        WhoopGeneration::Gen4 => WhoopPacket::from_data(bytes),
        WhoopGeneration::Gen5 => WhoopPacket::from_data_maverick(bytes),
        WhoopGeneration::Placeholder => return,
    };

    let decoded = match packet {
        Ok(packet) => match generation {
            WhoopGeneration::Gen4 => WhoopData::from_packet_gen4(packet),
            WhoopGeneration::Gen5 => WhoopData::from_packet_gen5(packet),
            WhoopGeneration::Placeholder => return,
        },
        Err(_) => return,
    };

    let WhoopData::RealtimeHr { unix, bpm } = (match decoded {
        Ok(decoded) => decoded,
        Err(_) => return,
    }) else {
        return;
    };

    let sample = HeartRateSample {
        unix,
        bpm,
        received_at_ms: now_unix_ms(),
    };
    let sample_at_ms = u64::from(unix).saturating_mul(1000);
    let app_state = app.state::<AppState>();
    let _ = app_state.inner().update_heart_rate_stream(|controller| {
        controller.last_sample_at_ms = Some(sample_at_ms);
        controller.last_bpm = Some(bpm);
        controller.last_error = None;
    });
    let _ = app.emit(HEART_RATE_STREAM_EVENT, sample);
}
