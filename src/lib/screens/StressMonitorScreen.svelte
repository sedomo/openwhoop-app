<script lang="ts">
  import { Button, Separator } from "bits-ui";
  import { onMount } from "svelte";
  import type { DailyInfoSummary } from "$lib/api/interfaces";
  import { appStore } from "$lib/stores/appStore";
  import type { SelectedWhoop } from "$lib/stores/selectedWhoop";
  import {
    getLatestStressValue,
    getStressPlotPath,
    getStressToneClass,
    stressBands,
  } from "$lib/stores/stressMonitor";

  export let whoop: SelectedWhoop;
  export let dailyInfo: DailyInfoSummary | null = null;
  export let onBack: () => void = () => undefined;
  const streamRunning = appStore.pages.stressMonitor.streamRunning;
  const monitorConnected = appStore.pages.stressMonitor.monitorConnected;
  const monitorDisplayScore = appStore.pages.stressMonitor.monitorDisplayScore;
  const monitorStatusText = appStore.pages.stressMonitor.monitorStatusText;
  const chartPath = appStore.pages.stressMonitor.chartPath;
  const glowPath = appStore.pages.stressMonitor.glowPath;
  const latestPoint = appStore.pages.stressMonitor.latestPoint;
  const monitorPlotVisible = appStore.pages.stressMonitor.monitorPlotVisible;
  const monitorCopyText = appStore.pages.stressMonitor.monitorCopyText;
  const summaryConnectionText =
    appStore.pages.stressMonitor.summaryConnectionText;
  $: liveStressScore = $monitorConnected ? Number($monitorDisplayScore) : null;
  $: liveStressToneClass = getStressToneClass(
    Number.isFinite(liveStressScore) ? liveStressScore : null,
  );
  $: syncedStressValue = getLatestStressValue(dailyInfo?.stress ?? null);
  $: syncedStressScore = dailyInfo?.stress?.latest.stress ?? null;
  $: syncedStressToneClass = getStressToneClass(syncedStressScore);
  $: syncedStressPlotPath = getStressPlotPath(dailyInfo?.stress ?? null);

  $: appStore.pages.stressMonitor.configure({
    whoop,
    onBack,
  });

  onMount(() => {
    void appStore.pages.stressMonitor.start();
    return () => appStore.pages.stressMonitor.stop();
  });
</script>

<section
  class="screen-shell stream-screen stream-screen--stress"
  aria-labelledby="stress-monitor-title"
>
  <div class="screen-stack screen-stack--wide">
    <header class="screen-header">
      <div>
        <p class="eyebrow">Live stream</p>
        <h1 id="stress-monitor-title">Stress monitor</h1>
      </div>

      <Button.Root
        class="ui-button ui-button--ghost"
        type="button"
        aria-label="Back to health page"
        onclick={() => void appStore.pages.stressMonitor.handleBack()}
      >
        Back
      </Button.Root>
    </header>

    <section
      class={`panel stack-sm ${liveStressToneClass}`}
      aria-label="Live stress monitor"
    >
      <div class="split-row split-row--top">
        <div class="stack-xs">
          <p class="eyebrow">Stress</p>
          <strong class="stream-value">
            {$monitorDisplayScore}
            <span>Score</span>
          </strong>
          <span class={`badge ${$monitorConnected ? "badge--connected" : "badge--offline"}`}>
            {$monitorStatusText}
          </span>
          <p class="muted">{$summaryConnectionText}</p>
        </div>

        <div class="summary-badge-column">
          <span class={`badge ${$streamRunning ? "badge--connected" : "badge--subtle"}`}>
            {$streamRunning ? "Streaming" : "Waiting"}
          </span>
          <span class="muted">{$monitorCopyText}</span>
        </div>
      </div>

      <Separator.Root class="ui-separator" />

      <div class="stream-plot-shell" aria-label="Stress plot">
        {#if $monitorPlotVisible && $latestPoint}
          <svg
            class="stream-plot-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id="stress-stream-line"
                x1="0"
                x2="1"
                y1="0"
                y2="0"
              >
                <stop offset="0%" stop-color="rgba(255, 145, 77, 0)"></stop>
                <stop offset="38%" stop-color="rgba(255, 145, 77, 0.28)"
                ></stop>
                <stop offset="100%" stop-color="rgba(255, 145, 77, 0.98)"
                ></stop>
              </linearGradient>
              <linearGradient
                id="stress-stream-glow"
                x1="0"
                x2="0"
                y1="0"
                y2="1"
              >
                <stop offset="0%" stop-color="rgba(255, 145, 77, 0.24)"
                ></stop>
                <stop offset="100%" stop-color="rgba(255, 145, 77, 0)"></stop>
              </linearGradient>
            </defs>

            <path d={$glowPath} class="stream-plot-glow"></path>
            <path d={$chartPath} class="stream-plot-line"></path>
            <line
              x1="96"
              y1="14"
              x2="96"
              y2="90"
              class="stream-plot-guide"
            ></line>
            <circle
              cx={$latestPoint?.x}
              cy={$latestPoint?.y}
              r="2.1"
              class="stream-plot-dot"
            ></circle>
          </svg>
        {:else}
          <p class="muted">Waiting for enough samples to estimate stress.</p>
        {/if}
      </div>
    </section>

    <section class="panel stack-sm" aria-label="Stress monitor summary">
      <div class="split-row">
        <div>
          <p class="eyebrow">
            {$summaryConnectionText}
          </p>
          <h2>Derived from live HR variability.</h2>
        </div>
        <span
          class={`badge ${$streamRunning ? "badge--connected" : "badge--subtle"}`}
        >
          {$streamRunning ? "Streaming" : "Waiting"}
        </span>
      </div>

      <div class="badge-row" aria-label="Stress monitor state">
        <span
          class={`badge ${$monitorConnected ? "badge--connected" : "badge--offline"}`}
        >
          {$monitorStatusText}
        </span>
        <span class="badge badge--subtle">
          {$monitorConnected ? "Realtime estimate" : "Awaiting signal"}
        </span>
      </div>

      <p class="muted">
        WHOOP does not broadcast a native stress packet here. This score is
        calculated from the same realtime heart-rate feed used by the live HR
        monitor.
      </p>
    </section>

    <section
      class={`panel stack-sm ${syncedStressToneClass}`}
      aria-label="Synced daily stress"
    >
      <div class="split-row split-row--top">
        <div class="stack-xs">
          <p class="eyebrow">Synced day</p>
          <strong class="stream-value">
            {syncedStressValue}
            <span>Latest</span>
          </strong>
          <span class="badge badge--subtle">
            {dailyInfo?.date ?? "No day selected"}
          </span>
        </div>

        <div class="summary-badge-column">
          <span class="badge badge--subtle">Historical</span>
          <span class="muted">10 minute averages</span>
        </div>
      </div>

      <Separator.Root class="ui-separator" />

      <div class="stream-plot-shell" aria-label="Synced stress plot">
        {#if syncedStressPlotPath}
          <svg
            class="stream-plot-svg"
            viewBox="0 0 240 56"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={syncedStressPlotPath} class="stress-history-line"></path>
          </svg>
        {:else}
          <p class="muted">No synced stress data for this day.</p>
        {/if}
      </div>
    </section>

    <section class="metric-grid" aria-label="Stress bands">
      {#each stressBands as band}
        <article class="metric-card">
          <span class="detail-label">{band.label}</span>
          <strong>{band.range}</strong>
          <p class="muted">{band.note}</p>
        </article>
      {/each}
    </section>

    <article class="panel stack-sm">
      <p class="eyebrow">How it works</p>
      <h2>The score updates as soon as WHOOP sends new heart-rate samples.</h2>
      <p class="muted">
        Early samples build the rolling window first, so the first stress value
        can appear a moment after the stream connects.
      </p>
    </article>
  </div>
</section>

<style>
  :global(.stress-tone--idle) {
    border-color: rgba(255, 255, 255, 0.08);
  }

  :global(.stress-tone--low) {
    border-color: rgba(90, 197, 168, 0.52);
    box-shadow:
      0 14px 36px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(90, 197, 168, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  :global(.stress-tone--moderate) {
    border-color: rgba(107, 195, 255, 0.52);
    box-shadow:
      0 14px 36px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(107, 195, 255, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  :global(.stress-tone--elevated) {
    border-color: rgba(255, 190, 92, 0.56);
    box-shadow:
      0 14px 36px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(255, 190, 92, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  :global(.stress-tone--high) {
    border-color: rgba(255, 108, 108, 0.58);
    box-shadow:
      0 14px 36px rgba(0, 0, 0, 0.18),
      0 0 0 1px rgba(255, 108, 108, 0.12),
      inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }

  .stress-history-line {
    fill: none;
    stroke: rgba(255, 145, 77, 0.92);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 3;
  }
</style>
