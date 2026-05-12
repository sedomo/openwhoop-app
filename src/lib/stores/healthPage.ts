import type { SelectedWhoop } from "$lib/stores/selectedWhoop";
import type {
  DailyInfoSummary,
  DailyStatsAverageSummary,
  DailyStatsSummary,
} from "$lib/api/interfaces";

export const stressSegments = [true, true, true, true];
const calibrationTargetSleeps = 7;

export function getHealthStatusLabel(whoop: SelectedWhoop) {
  return whoop.connected ? "Connected" : "Saved Offline";
}

export function getHealthOverviewMetrics(
  dailyInfo: DailyInfoSummary | null,
  latestStats: DailyStatsSummary | null,
  average: DailyStatsAverageSummary | null,
) {
  const latestSleep = dailyInfo?.sleep ?? null;
  const averageStats = getAverageStatsOrNull(average);
  const calibration = getCalibrationProgress(average);
  if (calibration.remainingSleeps > 0) {
    return [];
  }

  return [
    {
      short: "RHR",
      label: "Resting HR",
      value:
        latestStats?.rhr !== null && latestStats?.rhr !== undefined
          ? formatStatValue(latestStats.rhr)
          : latestSleep
            ? `${latestSleep.avgBpm}`
            : "-",
      trend: getMetricTrend(
        latestStats?.rhr ?? null,
        averageStats?.rhr ?? null,
        calibration,
        "lower",
      ),
    },
    {
      short: "HRV",
      label: "Heart Rate Variability",
      value:
        latestStats?.hrv !== null && latestStats?.hrv !== undefined
          ? formatStatValue(latestStats.hrv)
          : latestSleep
            ? `${latestSleep.avgHrv}`
            : "-",
      trend: getMetricTrend(
        latestStats?.hrv ?? null,
        averageStats?.hrv ?? null,
        calibration,
        "higher",
      ),
    },
  ];
}

function formatStatValue(value: number | null, digits = 0) {
  if (value === null) {
    return "-";
  }

  return digits > 0 ? value.toFixed(digits) : `${Math.round(value)}`;
}

function formatMetricNote(
  latest: number | null,
  baseline: number | null,
  unit = "",
  digits = 0,
) {
  if (latest === null) {
    return "Latest sleep data is not available yet.";
  }

  if (baseline === null) {
    return "Baseline unlocks after more sleep data.";
  }

  const delta = latest - baseline;
  const formattedDelta = `${delta > 0 ? "+" : ""}${formatStatValue(delta, digits)}${unit}`;
  return `${formattedDelta} vs 7-day baseline`;
}

function getMetricTrend(
  latest: number | null,
  baseline: number | null,
  calibration: ReturnType<typeof getCalibrationProgress>,
  betterDirection: "lower" | "higher",
) {
  if (latest === null) {
    return {
      label: "Pending",
      tone: "subtle",
    };
  }

  if (baseline === null) {
    return {
      label:
        calibration.remainingSleeps > 0 ? calibration.label : "Pending",
      tone: "subtle",
    };
  }

  if (latest === baseline) {
    return {
      label: "On baseline",
      tone: "subtle",
    };
  }

  const isGood =
    betterDirection === "lower" ? latest < baseline : latest > baseline;

  return {
    label: isGood ? "Good" : "Below baseline",
    tone: isGood ? "connected" : "offline",
  };
}

export function getHealthMonitorMetrics(
  latestStats: DailyStatsSummary | null,
  average: DailyStatsAverageSummary | null,
) {
  const averageStats = getAverageStatsOrNull(average);
  const calibration = getCalibrationProgress(average);
  if (calibration.remainingSleeps > 0) {
    return [];
  }

  return [
    {
      short: "RHR",
      label: "Resting Heart Rate",
      value: formatStatValue(latestStats?.rhr ?? null),
      note: formatMetricNote(latestStats?.rhr ?? null, averageStats?.rhr ?? null),
      trend: getMetricTrend(
        latestStats?.rhr ?? null,
        averageStats?.rhr ?? null,
        calibration,
        "lower",
      ),
    },
    {
      short: "HRV",
      label: "Heart Rate Variability",
      value: formatStatValue(latestStats?.hrv ?? null),
      note: formatMetricNote(latestStats?.hrv ?? null, averageStats?.hrv ?? null),
      trend: getMetricTrend(
        latestStats?.hrv ?? null,
        averageStats?.hrv ?? null,
        calibration,
        "higher",
      ),
    },
  ];
}

export function getCalibrationProgress(average: DailyStatsAverageSummary | null) {
  const missingDays =
    average?.status === "missingDays"
      ? (average.missingDays ?? average.missing_days ?? 0)
      : 0;
  const completedSleeps = Math.max(0, calibrationTargetSleeps - missingDays);

  return {
    completedSleeps,
    totalSleeps: calibrationTargetSleeps,
    percent: (completedSleeps / calibrationTargetSleeps) * 100,
    remainingSleeps: Math.max(0, missingDays),
    label:
      missingDays > 0
        ? `${missingDays} sleep${missingDays === 1 ? "" : "s"} left`
        : "Baseline ready",
  };
}

export function getAverageStatsOrNull(
  average: DailyStatsAverageSummary | null,
) {
  return average?.status === "average" ? average.stats : null;
}
