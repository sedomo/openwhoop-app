import { invoke } from "@tauri-apps/api/core";
import type {
    ActivityTypeOption,
    AppLogLevel,
    DailyInfoSummary,
    DailyStatsAverageSummary,
    DailyStatsSummary,
    EarliestReadingTimeSummary,
    HeartRateStreamStatus,
    SavedWhoopConnectionResult,
    SavedWhoopRuntimeStatus,
    StressStreamStatus,
    ImportSyncStatus,
    WhoopScanResult,
    WhoopSelectionState,
} from "./interfaces";

export async function rebootWhoopDevice() {
    await invoke("reboot_whoop_device");
}

export async function clearSelectedWhoopAddress() {
    await invoke("clear_selected_whoop_address");
}

export async function eraseWhoopDeviceData() {
    await invoke("erase_whoop_device_data");
}

export async function checkBlePermissions(ask: boolean): Promise<boolean> {
    return invoke("tauri_blec_check_permissions", { ask })
}

export async function connectToSavedWhoop(): Promise<SavedWhoopConnectionResult | null> {
    return invoke("connect_to_saved_whoop");
}

export async function connectToWhoop(address: string): Promise<string> {
    return invoke("connect_to_whoop", { address })
}

export async function writeAppLog(level: AppLogLevel, scope: string, message: string) {
    await invoke("write_frontend_log", {
        level, scope, message
    })
}

export async function scanForWhoops(): Promise<WhoopScanResult[]> {
    return await invoke("scan_whoops");
}

export async function getSavedWhoopRuntimeStatus(): Promise<SavedWhoopRuntimeStatus> {
    return await invoke("get_saved_whoop_runtime_status");
}

export async function getDailyInfo(date?: string): Promise<DailyInfoSummary> {
    return await invoke("get_daily_info", { date });
}

export async function getLatestDailyStats(): Promise<DailyStatsSummary | null> {
    return await invoke("get_latest_daily_stats");
}

export async function getLast7DayDailyStatsAverage(): Promise<DailyStatsAverageSummary> {
    return await invoke("get_last_7_day_daily_stats_average");
}

export async function getEarliestReadingTime(): Promise<EarliestReadingTimeSummary | null> {
    return await invoke("get_earliest_reading_time");
}

export async function getActivityTypes(): Promise<ActivityTypeOption[]> {
    return await invoke("get_activity_types");
}

export async function createActivity(
    from: string,
    to: string,
    activityType?: string,
): Promise<void> {
    await invoke("create_activity", { from, to, activityType });
}

export async function updateActivity(
    originalStart: string,
    nextStart: string,
    nextEnd: string,
    activityType?: string,
): Promise<void> {
    await invoke("update_activity", { originalStart, nextStart, nextEnd, activityType });
}

export async function deleteActivity(originalStart: string): Promise<void> {
    await invoke("delete_activity", { originalStart });
}

export async function getLatestReadingLabel(): Promise<string | null> {
    return await invoke("get_latest_reading_label");
}

export async function getWhoopSelectionState(): Promise<WhoopSelectionState> {
    return await invoke("get_whoop_selection_state");
}

export async function getHeartRateStreamStatus(): Promise<HeartRateStreamStatus> {
    return await invoke("get_heart_rate_stream_status");
}

export async function startHeartRateStream(): Promise<HeartRateStreamStatus> {
    return await invoke("start_heart_rate_stream");
}

export async function stopHeartRateStream(): Promise<HeartRateStreamStatus> {
    return await invoke("stop_heart_rate_stream");
}

export async function getStressStreamStatus(): Promise<StressStreamStatus> {
    return await invoke("get_stress_stream_status");
}

export async function startStressStream(): Promise<StressStreamStatus> {
    return await invoke("start_stress_stream");
}

export async function stopStressStream(): Promise<StressStreamStatus> {
    return await invoke("stop_stress_stream");
}

export async function exportDatabaseCopy(): Promise<string | null> {
    return await invoke("export_database_copy");
}

export async function importDatabaseSync(): Promise<boolean> {
    return await invoke("start_import_database_sync");
}

export async function getImportSyncStatus(): Promise<ImportSyncStatus> {
    return await invoke("get_import_sync_status");
}

export async function getDebugPackets(): Promise<boolean> {
    return await invoke("get_debug_packets");
}

export async function setDebugPackets(enabled: boolean): Promise<boolean> {
    return await invoke("set_debug_packets", { enabled });
}
