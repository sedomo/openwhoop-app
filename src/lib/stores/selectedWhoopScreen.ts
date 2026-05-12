import { writable } from "svelte/store";
import type { DailyStressInfoSummary } from "$lib/api/interfaces";
import type { SelectedWhoop } from "$lib/stores/selectedWhoop";

export type DeviceState = "connected" | "syncing" | "error";

export const statCards = [
  { label: "Sleep", value: "--%" },
  { label: "Recovery", value: "--%" },
  { label: "Strain", value: "--" },
];

export const monitorCards = [
  { title: "Health Monitor", detail: "No Data Available" },
  { title: "Stress Monitor", detail: "No Data Available" },
];

export function getStatCards(
  sleepScore: number | null,
  strainScore: number | null,
) {
  return [
    {
      label: "Sleep",
      value: sleepScore === null ? "--%" : `${Math.round(sleepScore)}%`,
    },
    { label: "Recovery", value: "--%" },
    {
      label: "Strain",
      value: strainScore === null ? "--" : strainScore.toFixed(1),
    },
  ];
}

export function getLatestStressValue(stress: DailyStressInfoSummary | null) {
  const latest = stress?.latest.stress;
  return latest === null || latest === undefined ? "--.-" : latest.toFixed(1);
}

export function getStressPlotPath(
  stress: DailyStressInfoSummary | null,
  width = 240,
  height = 56,
) {
  const readings = stress?.minuteAverages ?? [];
  if (readings.length === 0) {
    return "";
  }

  const values = readings.map((reading) => reading.stress).filter((value): value is number => value !== null);
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.5, max - min);

  let fallback = values[0];
  return readings
    .map((reading, index) => {
      const x = readings.length === 1 ? width / 2 : (index / (readings.length - 1)) * width;
      fallback = reading.stress ?? fallback;
      const normalized = (fallback - min) / range;
      const y = height - normalized * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

const maxPullSyncRevealPx = 3.6 * 16;

function pageAtTop() {
  return (window.scrollY || document.documentElement.scrollTop || 0) <= 0;
}

function startedFromInteractiveTarget(event: TouchEvent) {
  const target = event.target;
  return (
    target instanceof Element &&
    target.closest("button, input, select, textarea, label, a") !== null
  );
}

export function getDeviceState(
  whoop: SelectedWhoop,
  reconnecting: boolean,
): DeviceState {
  if (whoop.connected) {
    return "connected";
  }

  if (reconnecting) {
    return "syncing";
  }

  return "error";
}

export function getConnectionCopy(
  whoop: SelectedWhoop,
  reconnecting: boolean,
) {
  const state = getDeviceState(whoop, reconnecting);

  if (state === "connected") {
    return "LIVE";
  }

  if (state === "syncing") {
    return "SYNC";
  }

  return "--%";
}

export function createSelectedWhoopScreenState() {
  const pullSyncRevealPx = writable(0);
  let pullStartY: number | null = null;
  let pullTracking = false;

  function handlePullStart(event: TouchEvent) {
    if (!pageAtTop() || startedFromInteractiveTarget(event)) {
      pullTracking = false;
      pullStartY = null;
      return;
    }

    pullTracking = true;
    pullStartY = event.touches[0]?.clientY ?? null;
  }

  function handlePullMove(event: TouchEvent) {
    if (!pullTracking || pullStartY === null || !pageAtTop()) {
      return;
    }

    const currentY = event.touches[0]?.clientY ?? pullStartY;
    const deltaY = Math.max(0, currentY - pullStartY);
    pullSyncRevealPx.set(Math.min(maxPullSyncRevealPx, deltaY * 0.42));
  }

  function resetPullSync() {
    pullTracking = false;
    pullStartY = null;
    pullSyncRevealPx.set(0);
  }

  return {
    pullSyncRevealPx,
    handlePullStart,
    handlePullMove,
    resetPullSync,
  };
}
