use chrono::{Local, NaiveDate, NaiveDateTime};
use openwhoop::OpenWhoop;
use openwhoop_codec::constants::WhoopGeneration;
use tauri::AppHandle;

use crate::{
    error::AppResult,
    handlers::{log_error, log_info},
    state::DatabaseState,
};
use openwhoop::db::{DailyStats, DailyStatsAverage};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySleepSummary {
    sleep_id: NaiveDate,
    start: NaiveDateTime,
    end: NaiveDateTime,
    avg_bpm: u8,
    avg_hrv: u16,
    score: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStrainSummary {
    date: NaiveDate,
    strain: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyActivitySummary {
    period_id: NaiveDate,
    start: NaiveDateTime,
    end: NaiveDateTime,
    activity: String,
    strain: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStressReadingSummary {
    time: NaiveDateTime,
    stress: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStressInfoSummary {
    latest: DailyStressReadingSummary,
    minute_averages: Vec<DailyStressReadingSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyInfoSummary {
    date: NaiveDate,
    sleep: Option<DailySleepSummary>,
    strain: Option<DailyStrainSummary>,
    activities: Vec<DailyActivitySummary>,
    stress: Option<DailyStressInfoSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStatsSummary {
    hrv: Option<f64>,
    rhr: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum DailyStatsAverageSummary {
    Average { stats: DailyStatsSummary },
    MissingDays { missing_days: u8 },
}

#[tauri::command]
pub async fn get_daily_info(
    app: AppHandle,
    database_state: tauri::State<'_, DatabaseState>,
    date: Option<String>,
) -> AppResult<DailyInfoSummary> {
    let resolved_date = date
        .as_deref()
        .map(parse_date)
        .transpose()
        .map_err(crate::error::AppError::from)?;

    daily_info_snapshot(database_state.inner(), resolved_date)
        .await
        .map_err(|err| {
            log_error(
                &app,
                "daily_info",
                format!("Unable to load daily info summary: {:?}", err),
            );
            err
        })
}

#[tauri::command]
pub async fn get_latest_daily_stats(
    app: AppHandle,
    database_state: tauri::State<'_, DatabaseState>,
) -> AppResult<Option<DailyStatsSummary>> {
    let database = database_state.database();
    let whoop = OpenWhoop::new(database, WhoopGeneration::Placeholder);

    whoop
        .get_latest_daily_stats()
        .await
        .map(|stats| stats.map(map_daily_stats))
        .map_err(|err| {
            let err = err.to_string();
            log_error(
                &app,
                "daily_stats.latest",
                format!("Unable to load latest daily stats: {err}"),
            );
            err.into()
        })
}

#[tauri::command]
pub async fn get_last_7_day_daily_stats_average(
    app: AppHandle,
    database_state: tauri::State<'_, DatabaseState>,
) -> AppResult<DailyStatsAverageSummary> {
    let database = database_state.database();
    let whoop = OpenWhoop::new(database, WhoopGeneration::Placeholder);

    whoop
        .get_last_7_day_daily_stats_average()
        .await
        .map(map_daily_stats_average)
        .map_err(|err| {
            let err = err.to_string();
            log_error(
                &app,
                "daily_stats.average",
                format!("Unable to load last 7 day daily stats average: {err}"),
            );
            err.into()
        })
}

pub async fn daily_info_snapshot(
    database_state: &DatabaseState,
    date: Option<NaiveDate>,
) -> AppResult<DailyInfoSummary> {
    let database = database_state.database();
    let target_date = date.unwrap_or_else(|| Local::now().date_naive());
    let today = Local::now().date_naive();

    let mut whoop = OpenWhoop::new(database.clone(), WhoopGeneration::Placeholder);
    let mut info = whoop
        .get_daily_info(target_date)
        .await
        .map_err(|err| err.to_string())?;

    if target_date == today && info.activities.is_empty() {
        whoop
            .detect_events()
            .await
            .map_err(|err| format!("Event detection failed: {err}"))?;
    }

    if target_date == today && info.strain.is_none() {
        whoop
            .calculate_latest_strain()
            .await
            .map_err(|err| format!("Strain calculation failed: {err}"))?;
    }

    if target_date == today && info.stress.is_none() {
        whoop
            .calculate_stress()
            .await
            .map_err(|err| format!("Stress calculation failed: {err}"))?;
    }

    info = database
        .get_daily_info(target_date)
        .await
        .map_err(|err| err.to_string())?;

    Ok(DailyInfoSummary {
        date: info.date,
        sleep: info.sleep.map(|sleep| DailySleepSummary {
            sleep_id: sleep.id,
            start: sleep.start,
            end: sleep.end,
            avg_bpm: sleep.avg_bpm,
            avg_hrv: sleep.avg_hrv,
            score: sleep.score,
        }),
        strain: info.strain.map(|strain| DailyStrainSummary {
            date: strain.date,
            strain: strain.strain,
        }),
        activities: info
            .activities
            .into_iter()
            .map(|activity| DailyActivitySummary {
                period_id: activity.period_id,
                start: activity.from,
                end: activity.to,
                activity: activity.activity.to_string(),
                strain: activity.strain,
            })
            .collect(),
        stress: info.stress.map(|stress| DailyStressInfoSummary {
            latest: DailyStressReadingSummary {
                time: stress.latest.time,
                stress: stress.latest.stress,
            },
            minute_averages: stress
                .minute_averages
                .into_iter()
                .map(|reading| DailyStressReadingSummary {
                    time: reading.time,
                    stress: reading.stress,
                })
                .collect(),
        }),
    })
}

fn parse_date(value: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|err| format!("Invalid date '{value}': {err}"))
}

fn map_daily_stats(stats: DailyStats) -> DailyStatsSummary {
    DailyStatsSummary {
        hrv: stats.hrv,
        rhr: stats.rhr,
    }
}

fn map_daily_stats_average(stats: DailyStatsAverage) -> DailyStatsAverageSummary {
    match stats {
        DailyStatsAverage::Average(stats) => DailyStatsAverageSummary::Average {
            stats: map_daily_stats(stats),
        },
        DailyStatsAverage::MissingDays(missing_days) => {
            DailyStatsAverageSummary::MissingDays { missing_days }
        }
    }
}
