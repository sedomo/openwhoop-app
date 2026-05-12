use std::collections::VecDeque;

use chrono::Utc;
use openwhoop::algo::StressCalculator;
use openwhoop_codec::{constants::WhoopGeneration, ParsedHistoryReading, WhoopData, WhoopPacket};
use tauri::{AppHandle, Emitter, Manager};

use crate::{
    error::{AppError, AppResult},
    handlers::{
        hr_stream::stop_heart_rate_stream_internal, log_error, log_info,
        whoop_manager::read_persisted_whoop_store,
    },
    internals::{ensure_connected_saved_whoop, frame_whoop_command},
    now_unix_ms, AppState,
};

const MIN_REALTIME_STRESS_SAMPLES: usize = 2;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StressStreamStatus {
    pub running: bool,
    pub generation: Option<WhoopGeneration>,
    pub last_sample_at_ms: Option<u64>,
    pub last_score: Option<f64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StressSample {
    unix: u32,
    score: f64,
    received_at_ms: u64,
}

#[derive(Default)]
struct RealtimeStressWindow {
    readings: VecDeque<ParsedHistoryReading>,
}

impl RealtimeStressWindow {
    fn push(&mut self, unix: u32, bpm: u8) -> Option<f64> {
        if bpm == 0 {
            return None;
        }

        let time = chrono::DateTime::from_timestamp(i64::from(unix), 0)
            .map(|timestamp| timestamp.naive_utc())
            .unwrap_or_else(|| Utc::now().naive_utc());

        self.readings.push_back(ParsedHistoryReading {
            time,
            bpm,
            rr: Vec::new(),
            imu_data: None,
            gravity: None,
        });

        while self.readings.len() > StressCalculator::MIN_READING_PERIOD {
            self.readings.pop_front();
        }

        let min_samples = MIN_REALTIME_STRESS_SAMPLES.min(StressCalculator::MIN_READING_PERIOD);
        if self.readings.len() < min_samples {
            return None;
        }

        let readings = self.readings.make_contiguous();
        StressCalculator::calculate_stress_with_min_reading_period(readings, min_samples)
            .map(|stress| stress.score)
    }
}

pub struct StressStreamController {
    running: bool,
    generation: Option<WhoopGeneration>,
    next_seq: u8,
    last_sample_at_ms: Option<u64>,
    last_score: Option<f64>,
    last_error: Option<String>,
    window: RealtimeStressWindow,
}

impl Default for StressStreamController {
    fn default() -> Self {
        Self {
            running: false,
            generation: None,
            next_seq: 0,
            last_sample_at_ms: None,
            last_score: None,
            last_error: None,
            window: RealtimeStressWindow::default(),
        }
    }
}

impl StressStreamController {
    pub fn is_running(&self) -> bool {
        self.running
    }
}

#[tauri::command]
pub fn get_stress_stream_status(
    state: tauri::State<'_, AppState>,
) -> AppResult<StressStreamStatus> {
    stress_stream_status_snapshot(state.inner())
}

#[tauri::command]
pub async fn start_stress_stream(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<StressStreamStatus> {
    let store = read_persisted_whoop_store(&app)?;
    let Some((address, generation)) = store.whoop_and_generation() else {
        return Err(AppError::from("Whoop device not selected"));
    };

    log_info(
        &app,
        "stress_stream",
        format!(
            "Start stress stream requested address={} generation={}",
            address, generation
        ),
    );

    stop_heart_rate_stream_internal(&app, state.inner()).await?;
    stop_stress_stream_internal(&app, state.inner()).await?;
    ensure_connected_saved_whoop(&address).await?;

    let handler = tauri_plugin_blec::get_handler()?;
    let callback_app = app.clone();
    if let Err(error) = handler
        .subscribe(
            generation.data_from_strap(),
            Some(generation.service()),
            move |bytes: Vec<u8>| handle_stress_notification(&callback_app, generation, bytes),
        )
        .await
        .map_err(|err| err.to_string())
    {
        log_error(
            &app,
            "stress_stream",
            format!("Unable to subscribe to WHOOP stress data characteristic: {error}"),
        );
        return Err(AppError::from(error));
    }

    let callback_app = app.clone();
    if let Err(error) = handler
        .subscribe(
            generation.cmd_from_strap(),
            Some(generation.service()),
            move |bytes: Vec<u8>| handle_stress_notification(&callback_app, generation, bytes),
        )
        .await
        .map_err(|err| err.to_string())
    {
        let _ = handler.unsubscribe(generation.data_from_strap()).await;
        log_error(
            &app,
            "stress_stream",
            format!("Unable to subscribe to WHOOP stress command characteristic: {error}"),
        );
        return Err(AppError::from(error));
    }

    state.inner().update_stress_stream(|controller| {
        controller.running = true;
        controller.generation = Some(generation);
        controller.next_seq = 0;
        controller.last_sample_at_ms = None;
        controller.last_score = None;
        controller.last_error = None;
        controller.window = RealtimeStressWindow::default();
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

        state.inner().update_stress_stream(|controller| {
            controller.running = false;
            controller.generation = None;
            controller.next_seq = 0;
            controller.last_error = Some(error.clone());
            controller.window = RealtimeStressWindow::default();
        })?;

        return Err(AppError::from(error));
    }

    log_info(&app, "stress_stream", "Stress stream started successfully.");
    stress_stream_status_snapshot(state.inner())
}

fn next_stress_stream_seq(state: &AppState) -> AppResult<u8> {
    let seq = state.get_stress_stream(|s| s.next_seq)?;
    state.update_stress_stream(|c| c.next_seq = seq.wrapping_add(1))?;
    Ok(seq)
}

pub fn stress_stream_status_snapshot(state: &AppState) -> AppResult<StressStreamStatus> {
    state.get_stress_stream(|controller| StressStreamStatus {
        running: controller.running,
        generation: controller.generation,
        last_sample_at_ms: controller.last_sample_at_ms,
        last_score: controller.last_score,
        last_error: controller.last_error.clone(),
    })
}

pub(crate) async fn stop_stress_stream_internal(
    app: &AppHandle,
    state: &AppState,
) -> AppResult<StressStreamStatus> {
    let (running, generation) = state.get_stress_stream(|c| (c.running, c.generation))?;

    if !running {
        return stress_stream_status_snapshot(state);
    }

    log_info(app, "stress_stream", "Stopping the live stress stream.");

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
                    let _ = state.update_stress_stream(move |controller| {
                        controller.last_error = Some(error);
                    });
                }
            }

            let _ = handler.unsubscribe(generation.data_from_strap()).await;
            let _ = handler.unsubscribe(generation.cmd_from_strap()).await;
        }

        state.update_stress_stream(|controller| {
            controller.running = false;
            controller.generation = None;
            controller.next_seq = 0;
            controller.last_sample_at_ms = None;
            controller.last_score = None;
            controller.window = RealtimeStressWindow::default();
        })?;
    }

    stress_stream_status_snapshot(state)
}

async fn send_connected_whoop_command(
    state: &AppState,
    generation: WhoopGeneration,
    packet: WhoopPacket,
) -> Result<(), String> {
    let handler = tauri_plugin_blec::get_handler().map_err(|err| err.to_string())?;
    let seq = next_stress_stream_seq(state)?;
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
pub async fn stop_stress_stream(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<StressStreamStatus> {
    stop_stress_stream_internal(&app, state.inner())
        .await
        .map(|status| {
            log_info(
                &app,
                "stress_stream",
                "Stress stream stop request completed.",
            );
            status
        })
        .map_err(|err| {
            log_error(
                &app,
                "stress_stream",
                format!("Unable to stop the stress stream: {:?}", err),
            );
            err
        })
}

fn handle_stress_notification(app: &AppHandle, generation: WhoopGeneration, bytes: Vec<u8>) {
    const STRESS_STREAM_EVENT: &str = "stress-stream-sample";

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

    let app_state = app.state::<AppState>();
    let mut score = None;
    let _ = app_state.inner().update_stress_stream(|controller| {
        if !controller.running {
            return;
        }

        score = controller.window.push(unix, bpm);
    });

    let Some(score) = score else {
        return;
    };

    let sample = StressSample {
        unix,
        score,
        received_at_ms: now_unix_ms(),
    };
    let sample_at_ms = u64::from(unix).saturating_mul(1000);
    let _ = app_state.inner().update_stress_stream(|controller| {
        controller.last_sample_at_ms = Some(sample_at_ms);
        controller.last_score = Some(score);
        controller.last_error = None;
    });
    let _ = app.emit(STRESS_STREAM_EVENT, sample);
}
