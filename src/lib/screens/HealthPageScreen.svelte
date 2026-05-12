<script lang="ts">
  import { Button, Progress, Separator } from "bits-ui";
  import type { DailyInfoSummary } from "$lib/api/interfaces";
  import { appStore } from "$lib/stores/appStore";
  import type { SelectedWhoop } from "$lib/stores/selectedWhoop";
  import {
    getAverageStatsOrNull,
    getCalibrationProgress,
    getHealthStatusLabel,
    getHealthOverviewMetrics,
  } from "$lib/stores/healthPage";
  import {
    getLatestStressValue,
    getStressPlotPath,
  } from "$lib/stores/stressMonitor";

  export let whoop: SelectedWhoop;
  export let dailyInfo: DailyInfoSummary | null = null;
  export let onOpenHealthMonitor: () => void = () => undefined;
  export let onOpenStressMonitor: () => void = () => undefined;

  const last7DayDailyStatsAverage = appStore.home.last7DayDailyStatsAverage;
  const latestDailyStats = appStore.home.latestDailyStats;
  $: averageStats = getAverageStatsOrNull($last7DayDailyStatsAverage);
  $: calibration = getCalibrationProgress($last7DayDailyStatsAverage);
  $: healthOverviewMetrics = getHealthOverviewMetrics(
    dailyInfo,
    $latestDailyStats,
    $last7DayDailyStatsAverage,
  );
  $: syncedStressValue = getLatestStressValue(dailyInfo?.stress ?? null);
  $: syncedStressPlotPath = getStressPlotPath(dailyInfo?.stress ?? null);
</script>

<section class="screen-shell" aria-labelledby="health-page-title">
  <div class="screen-stack">
    <header class="screen-header">
      <div>
        <p class="eyebrow">Recovery tools</p>
        <h1 id="health-page-title">Health</h1>
      </div>

      <span class={`badge ${whoop.connected ? "badge--connected" : "badge--offline"}`}>
        {getHealthStatusLabel(whoop)}
      </span>
    </header>

    <p class="muted">
        Baseline checks unlock after a few more nights of WHOOP sleep data.
    </p>

    <div class="stack-sm">
      <Button.Root
        class="panel panel-action stack-sm"
        type="button"
        aria-label="Open health monitor"
        onclick={onOpenHealthMonitor}
      >
        <div class="section-header">
          <div>
            <p class="eyebrow">Overview</p>
            <h2>Health monitor</h2>
          </div>
          <span class="badge badge--subtle">Open live</span>
        </div>

        {#if healthOverviewMetrics.length > 0}
          <div class="metric-grid" aria-label="Health monitor metrics">
            {#each healthOverviewMetrics as metric}
              <article class="metric-card metric-card--compact">
                <span class="detail-label">{metric.short}</span>
                <strong>{metric.value}</strong>
                <span class={`badge badge--${metric.trend.tone}`}>{metric.trend.label}</span>
                <p class="muted">{metric.label}</p>
              </article>
            {/each}
          </div>
        {:else}
          <p class="muted">
            Health comparisons unlock after a few more nights of WHOOP sleep data.
          </p>
        {/if}

        <Separator.Root class="ui-separator" />

        {#if calibration.remainingSleeps > 0}
          <div class="stack-xs">
            <div class="split-row">
              <strong>Calibration progress</strong>
              <span class="muted">{calibration.label}</span>
            </div>

            <Progress.Root
              class="ui-progress"
              value={calibration.completedSleeps}
              max={calibration.totalSleeps}
              aria-label="Health calibration progress"
            >
              <span
                class="ui-progress-indicator"
                style={`width: ${calibration.percent}%`}
              ></span>
            </Progress.Root>
          </div>
        {/if}
      </Button.Root>

      <Button.Root
        class="panel panel-action stack-sm"
        type="button"
        aria-label="Open stress monitor"
        onclick={onOpenStressMonitor}
      >
        <div class="section-header">
          <div>
            <p class="eyebrow">Realtime</p>
            <h2 id="stress-widget-title">Stress monitor</h2>
          </div>
          <span class="badge badge--subtle">Live score</span>
        </div>

        <div class="split-row split-row--top">
          <div>
            <p class="detail-label">Latest synced</p>
            <strong class="hero-value">{syncedStressValue}</strong>
          </div>

          <div class="summary-badge-column">
            <span class="badge badge--subtle">Daily stress</span>
            <span class="muted">10 minute averages</span>
          </div>
        </div>

        {#if syncedStressPlotPath}
          <svg
            class="health-stress-preview"
            viewBox="0 0 240 56"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={syncedStressPlotPath}></path>
          </svg>
        {:else}
          <p class="muted">
            No synced stress data is available for this day yet.
          </p>
        {/if}

      </Button.Root>
    </div>
  </div>
</section>

<style>
  .health-stress-preview {
    display: block;
    height: 3.5rem;
    width: 100%;
  }

  .health-stress-preview path {
    fill: none;
    stroke: rgba(255, 190, 92, 0.95);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 3;
  }
</style>
