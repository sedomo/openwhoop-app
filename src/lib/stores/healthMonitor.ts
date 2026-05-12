import { browser } from "$app/environment";
import { isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { derived, get, writable } from "svelte/store";
import {
  getHeartRateStreamStatus,
  startHeartRateStream,
  stopHeartRateStream,
} from "$lib/api";
import type { HeartRateStreamStatus } from "$lib/api/interfaces";
import type { SelectedWhoop } from "$lib/stores/selectedWhoop";
import { logApp } from "$lib/utils/logging";
import { buildChartState, emptyChartState } from "$lib/stores/monitorChart";

interface HeartRateSample {
  unix: number;
  bpm: number;
  receivedAtMs: number;
}

interface CreateHealthMonitorScreenStateOptions {
  whoop: SelectedWhoop;
  onBack: () => void;
}

const heartRateEventName = "heart-rate-stream-sample";
const maxChartSamples = 24;
const mockSampleIntervalMs = 1000;
const autoRetryDelayMs = 3200;
const staleStreamThresholdMs = 6500;
const statusPollIntervalMs = 900;

export const healthMetrics = [
  {
    short: "RHR",
    label: "Resting Heart Rate",
    value: "-",
    note: "WHOOP is still calibrating your normal range.",
  },
  {
    short: "HRV",
    label: "Heart Rate Variability",
    value: "-",
    note: "You need a few more sleeps for trends.",
  },
];

function toErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function heartRateZone(bpm: number) {
  if (bpm < 90) {
    return "Zone 0";
  }

  if (bpm < 120) {
    return "Zone 1";
  }

  if (bpm < 140) {
    return "Zone 2";
  }

  if (bpm < 160) {
    return "Zone 3";
  }

  if (bpm < 175) {
    return "Zone 4";
  }

  return "Zone 5";
}

export function createHealthMonitorScreenState() {
  const tauriEnvironment = browser && isTauri();
  const streamRunning = writable(false);
  const streamBusy = writable(false);
  const streamError = writable("");
  const currentBpm = writable<number | null>(null);
  const hrSamples = writable<HeartRateSample[]>([]);
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
    [liveConnected, currentBpm],
    ([$liveConnected, $currentBpm]) => {
      return $liveConnected && $currentBpm !== null;
    },
  );
  const monitorDisplayBpm = derived(
    [monitorConnected, currentBpm],
    ([$monitorConnected, $currentBpm]) => {
      return $monitorConnected && $currentBpm !== null
        ? String($currentBpm)
        : "--";
    },
  );
  const monitorStatusText = derived(
    [monitorConnected, currentBpm],
    ([$monitorConnected, $currentBpm]) => {
      return $monitorConnected && $currentBpm !== null
        ? heartRateZone($currentBpm)
        : "Device Disconnected";
    },
  );
  const chart = derived(
    [liveConnected, currentBpm, hrSamples],
    ([$liveConnected, $currentBpm, $hrSamples]) => {
      if (!$liveConnected || $currentBpm === null || $hrSamples.length === 0) {
        return emptyChartState;
      }

      const visibleSamples = $hrSamples.slice(-maxChartSamples);
      const bpmValues = visibleSamples.map((sample) => sample.bpm);
      const minBpm = Math.min(...bpmValues);
      const maxBpm = Math.max(...bpmValues);
      const centerBpm = (minBpm + maxBpm) / 2;
      const normalizedRange = Math.max(12, maxBpm - minBpm + 8);

      return buildChartState(visibleSamples, (sample) => {
        return 72 - ((sample.bpm - centerBpm) / normalizedRange) * 28;
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
        return "Live heart rate stays active while this screen remains open.";
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
  let options: CreateHealthMonitorScreenStateOptions = {
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

  function configure(nextOptions: CreateHealthMonitorScreenStateOptions) {
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
    currentBpm.set(null);
    hrSamples.set([]);
    lastSignalAtMs.set(null);
    signalClockMs.set(Date.now());
  }

  function showDisconnectedUi() {
    streamRunning.set(false);
    resetSignalState();
  }

  function commitHeartRateSample(sample: HeartRateSample) {
    if (get(currentBpm) === null) {
      logApp(
        "info",
        "healthMonitor.stream",
        "Received the first live heart-rate sample.",
        {
          bpm: sample.bpm,
          receivedAtMs: sample.receivedAtMs,
        },
      );
    }

    const samples = get(hrSamples);
    const lastSample = samples[samples.length - 1];

    if (
      !lastSample ||
      lastSample.receivedAtMs !== sample.receivedAtMs ||
      lastSample.bpm !== sample.bpm
    ) {
      hrSamples.set([...samples.slice(-(maxChartSamples - 1)), sample]);
    }

    currentBpm.set(sample.bpm);
    lastSignalAtMs.set(sample.receivedAtMs);
    signalClockMs.set(sample.receivedAtMs);
    streamRunning.set(true);
    streamError.set("");
    clearRetryTimer();
  }

  function applyStreamStatus(status: HeartRateStreamStatus) {
    streamRunning.set(status.running);
    streamError.set(status.lastError ?? "");

    if (
      status.running &&
      status.lastBpm !== null &&
      status.lastSampleAtMs !== null
    ) {
      commitHeartRateSample({
        unix: Math.floor(status.lastSampleAtMs / 1000),
        bpm: status.lastBpm,
        receivedAtMs: status.lastSampleAtMs,
      });
      return;
    }

    if (!status.running && !hasFreshSignal()) {
      resetSignalState();
    }

    if (
      status.running &&
      (status.lastBpm === null || status.lastSampleAtMs === null) &&
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
      const status = await getHeartRateStreamStatus();
      logApp(
        "debug",
        "healthMonitor.stream",
        "Loaded the initial heart-rate stream status.",
        status,
      );
      applyStreamStatus(status);
    } catch (reason) {
      logApp(
        "error",
        "healthMonitor.stream",
        "Unable to load the initial heart-rate stream status.",
        reason,
      );
      streamError.set(toErrorMessage(reason));
    }
  }

  function nextMockBpm() {
    mockPhase += 1;

    const baseline =
      72 +
      Math.sin(mockPhase / 4.2) * 3 +
      Math.sin(mockPhase / 7.4) * 2 +
      (Math.random() - 0.5) * 2.2;

    return Math.round(Math.max(58, Math.min(92, baseline)));
  }

  function startMockStream() {
    stopMockStream();
    streamRunning.set(true);

    const emitSample = () => {
      commitHeartRateSample({
        unix: Math.floor(Date.now() / 1000),
        bpm: nextMockBpm(),
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
    logApp("info", "healthMonitor.stream", "Starting the heart-rate stream.", {
      address: options.whoop.address,
      generation: options.whoop.generation,
      force,
    });

    try {
      if (tauriEnvironment) {
        const status = await startHeartRateStream();
        applyStreamStatus(status);
        logApp(
          "info",
          "healthMonitor.stream",
          "Heart-rate stream start returned.",
          status,
        );
      } else {
        startMockStream();
      }
    } catch (reason) {
      showDisconnectedUi();
      logApp(
        "warn",
        "healthMonitor.stream",
        "Heart-rate stream start failed.",
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
    logApp("info", "healthMonitor.stream", "Stopping the heart-rate stream.");

    try {
      if (tauriEnvironment) {
        const status = await stopHeartRateStream();
        applyStreamStatus(status);
        logApp(
          "info",
          "healthMonitor.stream",
          "Heart-rate stream stopped.",
          status,
        );
      }
    } catch (reason) {
      logApp(
        "error",
        "healthMonitor.stream",
        "Heart-rate stream stop failed.",
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
        const status = await getHeartRateStreamStatus();
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
      "healthMonitor.lifecycle",
      "Leaving the health monitor screen.",
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
      "healthMonitor.lifecycle",
      "Mounting the health monitor screen.",
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
        "healthMonitor.connection",
        connected
          ? "Heart-rate monitor is live."
          : "Heart-rate monitor is disconnected.",
        {
          bpm: get(currentBpm),
          error: get(streamError) || null,
        },
      );
    });

    if (tauriEnvironment) {
      sampleListener = await listen<HeartRateSample>(heartRateEventName, (event) => {
        commitHeartRateSample(event.payload);
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
      "healthMonitor.lifecycle",
      "Unmounting the health monitor screen.",
    );
    void teardown();
  }

  return {
    streamRunning,
    streamBusy,
    streamError,
    monitorConnected,
    monitorDisplayBpm,
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
