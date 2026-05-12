import { browser } from "$app/environment";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { derived, get, writable } from "svelte/store";
import {
  getStressStreamStatus,
  startStressStream,
  stopStressStream,
} from "$lib/api";
import type {
  DailyStressInfoSummary,
  StressStreamStatus,
} from "$lib/api/interfaces";
import type { SelectedWhoop } from "$lib/stores/selectedWhoop";
import { logApp } from "$lib/utils/logging";
import { buildChartState, emptyChartState } from "$lib/stores/monitorChart";

interface StressSample {
  unix: number;
  score: number;
  receivedAtMs: number;
}

interface CreateStressMonitorScreenStateOptions {
  whoop: SelectedWhoop;
  onBack: () => void;
}

const stressEventName = "stress-stream-sample";
const maxChartSamples = 24;
const mockSampleIntervalMs = 1000;
const autoRetryDelayMs = 3200;
const staleStreamThresholdMs = 6500;
const statusPollIntervalMs = 900;

export const stressBands = [
  {
    label: "Low",
    range: "0.0 - 1.9",
    note: "Calm variability with little strain on the nervous system.",
  },
  {
    label: "Moderate",
    range: "2.0 - 4.9",
    note: "A normal working range during light activity or mental load.",
  },
  {
    label: "Elevated",
    range: "5.0 - 6.9",
    note: "Recovery demand is building and your body is working harder.",
  },
  {
    label: "High",
    range: "7.0 - 10.0",
    note: "Sympathetic load is high and the strap is seeing tight variability.",
  },
];

function toErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function stressBand(score: number) {
  if (score < 1.5) {
    return "Very Low";
  }

  if (score < 3) {
    return "Low";
  }

  if (score < 5) {
    return "Moderate";
  }

  if (score < 7) {
    return "Elevated";
  }

  return "High";
}

export function getLatestStressValue(stress: DailyStressInfoSummary | null) {
  const latest = stress?.latest.stress;
  return latest === null || latest === undefined ? "--.-" : latest.toFixed(1);
}

export function getStressToneClass(score: number | null) {
  if (score === null || score === undefined) {
    return "stress-tone--idle";
  }

  if (score < 2) {
    return "stress-tone--low";
  }

  if (score < 5) {
    return "stress-tone--moderate";
  }

  if (score < 7) {
    return "stress-tone--elevated";
  }

  return "stress-tone--high";
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

  const values = readings
    .map((reading) => reading.stress)
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.5, max - min);

  let fallback = values[0];
  return readings
    .map((reading, index) => {
      const x =
        readings.length === 1 ? width / 2 : (index / (readings.length - 1)) * width;
      fallback = reading.stress ?? fallback;
      const normalized = (fallback - min) / range;
      const y = height - normalized * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function createStressMonitorScreenState() {
  const tauriEnvironment = browser && isTauri();
  const streamRunning = writable(false);
  const streamBusy = writable(false);
  const streamError = writable("");
  const currentStress = writable<number | null>(null);
  const stressSamplesStore = writable<StressSample[]>([]);
  const lastSignalAtMs = writable<number | null>(null);
  const signalClockMs = writable(Date.now());
  const liveConnected = derived(
    [lastSignalAtMs, signalClockMs],
    ([$lastSignalAtMs, $signalClockMs]) => {
      return (
        $lastSignalAtMs !== null &&
        $signalClockMs - $lastSignalAtMs < staleStreamThresholdMs
      );
    },
  );
  const monitorConnected = derived(
    [liveConnected, currentStress],
    ([$liveConnected, $currentStress]) => {
      return $liveConnected && $currentStress !== null;
    },
  );
  const monitorDisplayScore = derived(
    [monitorConnected, currentStress],
    ([$monitorConnected, $currentStress]) => {
      return $monitorConnected && $currentStress !== null
        ? $currentStress.toFixed(1)
        : "--.-";
    },
  );
  const monitorStatusText = derived(
    [monitorConnected, currentStress],
    ([$monitorConnected, $currentStress]) => {
      return $monitorConnected && $currentStress !== null
        ? stressBand($currentStress)
        : "Device Disconnected";
    },
  );
  const chart = derived(
    [liveConnected, currentStress, stressSamplesStore],
    ([$liveConnected, $currentStress, $stressSamples]) => {
      if (
        !$liveConnected ||
        $currentStress === null ||
        $stressSamples.length === 0
      ) {
        return emptyChartState;
      }

      const visibleSamples = $stressSamples.slice(-maxChartSamples);

      return buildChartState(visibleSamples, (sample) => {
        const normalizedScore = Math.max(0, Math.min(10, sample.score));
        return 84 - (normalizedScore / 10) * 56;
      });
    },
  );
  const chartPath = derived(chart, ($chart) => $chart.chartPath);
  const glowPath = derived(chart, ($chart) => $chart.glowPath);
  const latestPoint = derived(chart, ($chart) => $chart.latestPoint);
  const monitorPlotVisible = derived(
    [monitorConnected, latestPoint, chartPath],
    ([$monitorConnected, $latestPoint, $chartPath]) => {
      return $monitorConnected && $latestPoint !== null && $chartPath !== "";
    },
  );
  const monitorCopyText = derived(
    [monitorConnected, streamBusy, streamError],
    ([$monitorConnected, $streamBusy, $streamError]) => {
      if ($monitorConnected) {
        return "Live stress is derived from WHOOP's realtime heart-rate variability while this screen remains open.";
      }

      if ($streamBusy) {
        return "Trying to reconnect to WHOOP automatically.";
      }

      if ($streamError) {
        return `Trying to reconnect to WHOOP automatically. ${$streamError}`;
      }

      return "Reconnect attempts continue automatically while this screen remains open.";
    },
  );
  const summaryConnectionText = derived(monitorConnected, ($monitorConnected) =>
    $monitorConnected ? "WHOOP connected" : "Saved WHOOP offline",
  );

  let sampleListener: UnlistenFn | null = null;
  let statusTimer: number | null = null;
  let retryTimer: number | null = null;
  let mockTimer: number | null = null;
  let mockPhase = 0;
  let mounted = false;
  let tearingDown = false;
  let disposed = false;
  let lastLoggedMonitorConnection: boolean | null = null;
  let stopMonitorLogging: () => void = () => {};
  let options: CreateStressMonitorScreenStateOptions = {
    whoop: {
      address: "",
      name: "",
      generation: "",
      rssi: null,
      restoredFromState: false,
      connected: false,
    },
    onBack: () => undefined,
  };

  function configure(nextOptions: CreateStressMonitorScreenStateOptions) {
    options = nextOptions;
    disposed = false;
    tearingDown = false;
  }

  function hasFreshSignal(referenceTime = Date.now()) {
    const lastSampleAt = get(lastSignalAtMs);
    return (
      lastSampleAt !== null &&
      referenceTime - lastSampleAt < staleStreamThresholdMs
    );
  }

  function clearRetryTimer() {
    if (browser && retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function clearStatusTimer() {
    if (browser && statusTimer !== null) {
      window.clearInterval(statusTimer);
      statusTimer = null;
    }
  }

  function stopMockStream() {
    if (browser && mockTimer !== null) {
      window.clearInterval(mockTimer);
      mockTimer = null;
    }
  }

  function resetSignalState() {
    currentStress.set(null);
    stressSamplesStore.set([]);
    lastSignalAtMs.set(null);
    signalClockMs.set(Date.now());
  }

  function showDisconnectedUi() {
    streamRunning.set(false);
    resetSignalState();
  }

  function commitStressSample(sample: StressSample) {
    if (get(currentStress) === null) {
      logApp(
        "info",
        "stressMonitor.stream",
        "Received the first live stress sample.",
        {
          score: sample.score,
          receivedAtMs: sample.receivedAtMs,
        },
      );
    }

    const samples = get(stressSamplesStore);
    const lastSample = samples[samples.length - 1];

    if (
      !lastSample ||
      lastSample.receivedAtMs !== sample.receivedAtMs ||
      lastSample.score !== sample.score
    ) {
      stressSamplesStore.set([...samples.slice(-(maxChartSamples - 1)), sample]);
    }

    currentStress.set(sample.score);
    lastSignalAtMs.set(sample.receivedAtMs);
    signalClockMs.set(sample.receivedAtMs);
    streamRunning.set(true);
    streamError.set("");
    clearRetryTimer();
  }

  function applyStreamStatus(status: StressStreamStatus) {
    streamRunning.set(status.running);
    streamError.set(status.lastError ?? "");

    if (
      status.running &&
      status.lastScore !== null &&
      status.lastSampleAtMs !== null
    ) {
      commitStressSample({
        unix: Math.floor(status.lastSampleAtMs / 1000),
        score: status.lastScore,
        receivedAtMs: status.lastSampleAtMs,
      });
      return;
    }

    if (!status.running && !hasFreshSignal()) {
      resetSignalState();
    }

    if (
      status.running &&
      (status.lastScore === null || status.lastSampleAtMs === null) &&
      !hasFreshSignal()
    ) {
      resetSignalState();
    }
  }

  async function loadInitialStreamStatus() {
    if (!tauriEnvironment) {
      return;
    }

    try {
      const status = await getStressStreamStatus();
      logApp(
        "debug",
        "stressMonitor.stream",
        "Loaded the initial stress stream status.",
        status,
      );
      applyStreamStatus(status);
    } catch (reason) {
      logApp(
        "error",
        "stressMonitor.stream",
        "Unable to load the initial stress stream status.",
        reason,
      );
      streamError.set(toErrorMessage(reason));
    }
  }

  function nextMockStress() {
    mockPhase += 1;

    const baseline =
      3.4 +
      Math.sin(mockPhase / 4.8) * 1.35 +
      Math.sin(mockPhase / 9.6) * 0.85 +
      (Math.random() - 0.5) * 0.7;

    return Math.round(Math.max(0.2, Math.min(9.8, baseline)) * 10) / 10;
  }

  function startMockStream() {
    stopMockStream();
    streamRunning.set(true);

    const emitSample = () => {
      commitStressSample({
        unix: Math.floor(Date.now() / 1000),
        score: nextMockStress(),
        receivedAtMs: Date.now(),
      });
    };

    emitSample();
    mockTimer = window.setInterval(emitSample, mockSampleIntervalMs);
  }

  function scheduleRetry(delay = autoRetryDelayMs) {
    if (
      !browser ||
      !mounted ||
      tearingDown ||
      get(streamBusy) ||
      retryTimer !== null ||
      hasFreshSignal()
    ) {
      return;
    }

    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      void startStream(true);
    }, delay);
  }

  async function startStream(force = false) {
    if (!mounted || tearingDown || get(streamBusy)) {
      return;
    }

    if (!force && hasFreshSignal()) {
      return;
    }

    clearRetryTimer();
    streamBusy.set(true);
    streamError.set("");
    resetSignalState();
    logApp("info", "stressMonitor.stream", "Starting the stress stream.", {
      address: options.whoop.address,
      generation: options.whoop.generation,
      force,
    });

    try {
      if (tauriEnvironment) {
        const status = await startStressStream();
        applyStreamStatus(status);
        logApp(
          "info",
          "stressMonitor.stream",
          "Stress stream start returned.",
          status,
        );
      } else {
        startMockStream();
      }
    } catch (reason) {
      showDisconnectedUi();
      logApp(
        "warn",
        "stressMonitor.stream",
        "Stress stream start failed.",
        reason,
      );
      streamError.set(toErrorMessage(reason));
    } finally {
      streamBusy.set(false);

      if (!hasFreshSignal()) {
        scheduleRetry();
      }
    }
  }

  async function stopStream() {
    clearRetryTimer();
    stopMockStream();
    streamBusy.set(true);
    logApp("info", "stressMonitor.stream", "Stopping the stress stream.");

    try {
      if (tauriEnvironment) {
        const status = await stopStressStream();
        applyStreamStatus(status);
        logApp(
          "info",
          "stressMonitor.stream",
          "Stress stream stopped.",
          status,
        );
      }
    } catch (reason) {
      logApp(
        "error",
        "stressMonitor.stream",
        "Stress stream stop failed.",
        reason,
      );
      streamError.set(toErrorMessage(reason));
    } finally {
      streamBusy.set(false);
      showDisconnectedUi();
    }
  }

  async function reconcileStreamState() {
    if (!mounted || tearingDown) {
      return;
    }

    if (tauriEnvironment) {
      try {
        const status = await getStressStreamStatus();
        applyStreamStatus(status);
      } catch (reason) {
        streamError.set(toErrorMessage(reason));
      }
    }

    if (!hasFreshSignal()) {
      showDisconnectedUi();
      scheduleRetry();
    }
  }

  async function teardown() {
    if (disposed) {
      return;
    }

    disposed = true;
    mounted = false;
    tearingDown = true;
    clearRetryTimer();
    clearStatusTimer();
    stopMonitorLogging();
    sampleListener?.();
    sampleListener = null;
    stopMockStream();
    await stopStream();
  }

  async function handleBack() {
    if (tearingDown) {
      return;
    }

    logApp(
      "info",
      "stressMonitor.lifecycle",
      "Leaving the stress monitor screen.",
    );
    await teardown();
    options.onBack();
  }

  async function start() {
    if (mounted) {
      return;
    }

    mounted = true;
    logApp(
      "info",
      "stressMonitor.lifecycle",
      "Mounting the stress monitor screen.",
      {
        address: options.whoop.address,
        generation: options.whoop.generation,
      },
    );

    stopMonitorLogging = monitorConnected.subscribe((connected) => {
      if (!mounted || connected === lastLoggedMonitorConnection) {
        return;
      }

      lastLoggedMonitorConnection = connected;
      logApp(
        connected ? "info" : "warn",
        "stressMonitor.connection",
        connected
          ? "Stress monitor is live."
          : "Stress monitor is disconnected.",
        {
          score: get(currentStress),
          error: get(streamError) || null,
        },
      );
    });

    if (tauriEnvironment) {
      sampleListener = await listen<StressSample>(stressEventName, (event) => {
        commitStressSample(event.payload);
      });

      await loadInitialStreamStatus();
    }

    if (browser) {
      statusTimer = window.setInterval(() => {
        signalClockMs.set(Date.now());
        void reconcileStreamState();
      }, statusPollIntervalMs);
    }

    scheduleRetry(60);
  }

  function stop() {
    logApp(
      "info",
      "stressMonitor.lifecycle",
      "Unmounting the stress monitor screen.",
    );
    void teardown();
  }

  return {
    streamRunning,
    monitorConnected,
    monitorDisplayScore,
    monitorStatusText,
    chartPath,
    glowPath,
    latestPoint,
    monitorPlotVisible,
    monitorCopyText,
    summaryConnectionText,
    configure,
    start,
    stop,
    handleBack,
  };
}
