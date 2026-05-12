<script lang="ts">
  import { Button, Progress, Separator } from "bits-ui";
  import { onMount } from "svelte";
  import { appStore } from "$lib/stores/appStore";
  import type { SelectedWhoop } from "$lib/stores/selectedWhoop";
  import {
    getAverageStatsOrNull,
    getCalibrationProgress,
    getHealthMonitorMetrics,
  } from "$lib/stores/healthPage";

  export let whoop: SelectedWhoop;
  export let onBack: () => void = () => undefined;
  const monitorConnected = appStore.pages.healthMonitor.monitorConnected;
  const monitorDisplayBpm = appStore.pages.healthMonitor.monitorDisplayBpm;
  const monitorStatusText = appStore.pages.healthMonitor.monitorStatusText;
  const chartPath = appStore.pages.healthMonitor.chartPath;
  const glowPath = appStore.pages.healthMonitor.glowPath;
  const latestPoint = appStore.pages.healthMonitor.latestPoint;
  const monitorPlotVisible = appStore.pages.healthMonitor.monitorPlotVisible;
  const monitorCopyText = appStore.pages.healthMonitor.monitorCopyText;
  const summaryConnectionText =
    appStore.pages.healthMonitor.summaryConnectionText;
  const latestDailyStats = appStore.home.latestDailyStats;
  const last7DayDailyStatsAverage = appStore.home.last7DayDailyStatsAverage;

  $: appStore.pages.healthMonitor.configure({
    whoop,
    onBack,
  });
  $: averageStats = getAverageStatsOrNull($last7DayDailyStatsAverage);
  $: calibration = getCalibrationProgress($last7DayDailyStatsAverage);
  $: healthMetrics = getHealthMonitorMetrics(
    $latestDailyStats,
    $last7DayDailyStatsAverage,
  );

  onMount(() => {
    void appStore.pages.healthMonitor.start();
    return () => appStore.pages.healthMonitor.stop();
  });
</script>

<section
  class="screen-shell stream-screen stream-screen--health"
  aria-labelledby="health-monitor-title"
>
  <div class="screen-stack screen-stack--wide">
    <header class="screen-header">
      <div>
        <p class="eyebrow">Live stream</p>
        <h1 id="health-monitor-title">Health monitor</h1>
      </div>

      <Button.Root
        class="ui-button ui-button--ghost"
        type="button"
        aria-label="Back to health page"
        onclick={() => void appStore.pages.healthMonitor.handleBack()}
      >
        Back
      </Button.Root>
    </header>

    <section class="panel stack-sm" aria-label="Live heart rate monitor">
      <div class="split-row split-row--top">
        <div class="stack-xs">
          <p class="eyebrow">Heart rate</p>
          <strong class="stream-value">
            {$monitorDisplayBpm}
            <span>BPM</span>
          </strong>
          <span class={`badge ${$monitorConnected ? "badge--connected" : "badge--offline"}`}>
            {$monitorStatusText}
          </span>
          <p class="muted">{$summaryConnectionText}</p>
        </div>

        <div class="summary-badge-column">
          <span class="badge badge--subtle">Auto reconnect</span>
          <span class="muted">{$monitorCopyText}</span>
        </div>
      </div>

      <Separator.Root class="ui-separator" />

      <div class="stream-plot-shell" aria-label="Heart rate plot">
        {#if $monitorPlotVisible && $latestPoint}
          <svg
            class="stream-plot-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="stream-line" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stop-color="rgba(27, 166, 239, 0)"></stop>
                <stop offset="38%" stop-color="rgba(27, 166, 239, 0.28)"
                ></stop>
                <stop offset="100%" stop-color="rgba(27, 166, 239, 0.98)"
                ></stop>
              </linearGradient>
              <linearGradient id="stream-glow" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stop-color="rgba(27, 166, 239, 0.2)"></stop>
                <stop offset="100%" stop-color="rgba(27, 166, 239, 0)"></stop>
              </linearGradient>
            </defs>

            <path d={$glowPath} class="stream-plot-glow"></path>
            <path d={$chartPath} class="stream-plot-line"></path>
            <line x1="96" y1="14" x2="96" y2="90" class="stream-plot-guide"></line>
            <circle
              cx={$latestPoint?.x}
              cy={$latestPoint?.y}
              r="2.1"
              class="stream-plot-dot"
            ></circle>
          </svg>
        {:else}
          <p class="muted">Waiting for live heart-rate samples.</p>
        {/if}
      </div>
    </section>

    {#if calibration.remainingSleeps > 0}
      <section class="panel stack-sm" aria-label="Health monitor summary">
        <div class="split-row">
          <div>
            <p class="eyebrow">{$summaryConnectionText}</p>
            <h2>Calibration in progress</h2>
          </div>
          <span class="badge badge--subtle">{calibration.label}</span>
        </div>

        <Progress.Root
          class="ui-progress"
          value={calibration.completedSleeps}
          max={calibration.totalSleeps}
          aria-label="Sleep calibration progress"
        >
          <span
            class="ui-progress-indicator"
            style={`width: ${calibration.percent}%`}
          ></span>
        </Progress.Root>
      </section>
    {/if}

    {#if healthMetrics.length > 0}
      <section class="metric-grid" aria-label="Health monitor details">
        {#each healthMetrics as metric}
          <article class="metric-card">
            <span class="detail-label">{metric.short}</span>
            <strong>{metric.value}</strong>
            <div class="split-row">
              <h3>{metric.label}</h3>
              <span class={`badge badge--${metric.trend.tone}`}>{metric.trend.label}</span>
            </div>
            <p class="muted">{metric.note}</p>
          </article>
        {/each}
      </section>
    {:else}
      <section class="panel stack-sm" aria-label="Health monitor details">
        <p class="muted">
          Health comparisons unlock after a few more nights of WHOOP sleep data.
        </p>
      </section>
    {/if}

    {#if calibration.remainingSleeps > 0}
      <article class="panel stack-sm">
        <p class="eyebrow">What unlocks this</p>
        <h2>Sleep calibration builds your baseline.</h2>
        <p class="muted">
          Once WHOOP logs enough overnight wear, this page can compare each metric
          against your normal range instead of showing placeholders.
        </p>
      </article>
    {/if}
  </div>
</section>
