use chrono::{Duration, Local, NaiveDateTime};
use tauri::AppHandle;

use crate::{error::AppResult, handlers::log_error, state::DatabaseState};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EarliestReadingTimeSummary {
    iso_date: String,
}

#[tauri::command]
pub async fn get_latest_reading_label(
    app: AppHandle,
    database_state: tauri::State<'_, DatabaseState>,
) -> AppResult<Option<String>> {
    latest_reading_label_snapshot(database_state.inner())
        .await
        .map_err(|err| {
            log_error(
                &app,
                "latest_reading",
                format!("Unable to load latest reading label: {:?}", err),
            );
            err
        })
}

pub async fn latest_reading_label_snapshot(
    database_state: &DatabaseState,
) -> AppResult<Option<String>> {
    Ok(database_state
        .database()
        .get_latest_reading_time()
        .await?
        .map(format_latest_reading_label))
}

fn format_latest_reading_label(reading: NaiveDateTime) -> String {
    let today = Local::now().date_naive();
    let yesterday = today - Duration::days(1);
    let reading_date = reading.date();

    if reading_date == today {
        return reading.format("%H:%M").to_string();
    }

    if reading_date == yesterday {
        return reading.format("%d %b, %H:%M").to_string();
    }

    reading.format("%d %b, %H:%M").to_string()
}

#[tauri::command]
pub async fn get_earliest_reading_time(
    app: AppHandle,
    database_state: tauri::State<'_, DatabaseState>,
) -> AppResult<Option<EarliestReadingTimeSummary>> {
    earliest_reading_time_snapshot(database_state.inner())
        .await
        .map_err(|err| {
            log_error(
                &app,
                "latest_reading",
                format!("Unable to load earliest reading time: {:?}", err),
            );
            err
        })
}

pub async fn earliest_reading_time_snapshot(
    database_state: &DatabaseState,
) -> AppResult<Option<EarliestReadingTimeSummary>> {
    let earliest_reading = database_state
        .database()
        .get_earliest_reading_time()
        .await?;

    Ok(earliest_reading.map(|reading| EarliestReadingTimeSummary {
        iso_date: reading.date().format("%Y-%m-%d").to_string(),
    }))
}
