export interface SavedWhoopConnectionResult {
    address: string;
    name: string | null;
    generation: string | null;
    rssi: number | null;
    connected: boolean;
    error: string | null;
}

export interface DailySleepSummary {
    sleepId: string;
    start: string;
    end: string;
    avgBpm: number;
    avgHrv: number;
    score: number;
}

export interface DailyStrainSummary {
    date: string;
    strain: number;
}

export interface DailyActivitySummary {
    periodId: string;
    start: string;
    end: string;
    activity: string;
    strain: number | null;
}

export interface DailyStressReadingSummary {
    time: string;
    stress: number | null;
}

export interface DailyStressInfoSummary {
    latest: DailyStressReadingSummary;
    minuteAverages: DailyStressReadingSummary[];
}

export interface ActivityTypeOption {
    value: string;
    label: string;
}

export interface DailyInfoSummary {
    date: string;
    sleep: DailySleepSummary | null;
    strain: DailyStrainSummary | null;
    activities: DailyActivitySummary[];
    stress: DailyStressInfoSummary | null;
}

export interface DailyStatsSummary {
    hrv: number | null;
    rhr: number | null;
}

export type DailyStatsAverageSummary =
    | {
        status: "average";
        stats: DailyStatsSummary;
    }
    | {
        status: "missingDays";
        missingDays: number;
        missing_days?: number;
    };


export type AppLogLevel = "debug" | "info" | "warn" | "error";


export interface WhoopScanResult {
    address: string;
    name: string;
    rssi: number | null;
    generation: string;
};


export interface BackgroundSyncStatus {
    running: boolean;
    deviceAddress: string | null;
    lastStartedAtMs: number | null;
    lastFinishedAtMs: number | null;
    lastSuccessAtMs: number | null;
    lastError: string | null;
    syncIntervalSecs: number;
    retryIntervalSecs: number;
}

export interface HeartRateStreamStatus {
    running: boolean;
    generation: string | null;
    lastSampleAtMs: number | null;
    lastBpm: number | null;
    lastError: string | null;
}

export interface StressStreamStatus {
    running: boolean;
    generation: string | null;
    lastSampleAtMs: number | null;
    lastScore: number | null;
    lastError: string | null;
}

export interface SavedWhoopRuntimeStatus {
    selectedWhoopAddress: string | null;
    connectedDeviceAddress: string | null;
    connected: boolean;
    latestReadingLabel: string | null;
    dailyInfo: DailyInfoSummary;
    backgroundSync: BackgroundSyncStatus;
    heartRateStream: HeartRateStreamStatus;
}


export interface WhoopSelectionState {
    selectedWhoopAddress: string | null;
    hasSelectedWhoop: boolean;
}

export interface ImportSyncStatus {
    running: boolean;
    stage: string;
    sourceLabel: string | null;
    startedAtMs: number | null;
    finishedAtMs: number | null;
    lastSuccessAtMs: number | null;
    lastError: string | null;
}

export interface EarliestReadingTimeSummary {
    isoDate: string;
}
