<script lang="ts">
  import { deleteActivity, getActivityTypes, updateActivity } from "$lib/api";
  import type { ActivityTypeOption, DailyActivitySummary, DailyInfoSummary } from "$lib/api/interfaces";
  import type { SelectedWhoop } from "$lib/stores/selectedWhoop";
  import { appStore } from "$lib/stores/appStore";
  import {
    getAverageStatsOrNull,
    getCalibrationProgress,
    getHealthOverviewMetrics,
  } from "$lib/stores/healthPage";
  import {
    getConnectionCopy,
    getDeviceState,
    getLatestStressValue,
    getStatCards,
    getStressPlotPath,
    monitorCards,
  } from "$lib/stores/selectedWhoopScreen";
  import "./SelectedWhoopScreen.css";

  export let whoop: SelectedWhoop;
  export let dailyInfo: DailyInfoSummary | null = null;
  export let latestSyncLabel = "--:--";
  export let clearing = false;
  export let reconnecting = false;
  export let selectedDate = "";
  export let canSelectPreviousDate = false;
  export let isToday = true;
  export let onOpenDeviceManagement: () => void = () => undefined;
  export let onOpenHealthMonitor: () => void = () => undefined;
  export let onOpenStressMonitor: () => void = () => undefined;
  export let onPreviousDate: () => void = () => undefined;
  export let onNextDate: () => void = () => undefined;
  export let onRefreshActivities: () => Promise<void> | void = () => undefined;
  const pullSyncRevealPx = appStore.pages.selectedWhoop.pullSyncRevealPx;
  const latestDailyStats = appStore.home.latestDailyStats;
  const last7DayDailyStatsAverage = appStore.home.last7DayDailyStatsAverage;
  $: statCards = getStatCards(
    dailyInfo?.sleep?.score ?? null,
    dailyInfo?.strain?.strain ?? null,
  );
  $: averageStats = getAverageStatsOrNull($last7DayDailyStatsAverage);
  $: calibration = getCalibrationProgress($last7DayDailyStatsAverage);
  $: healthOverviewMetrics = getHealthOverviewMetrics(
    dailyInfo,
    $latestDailyStats,
    $last7DayDailyStatsAverage,
  );
  $: currentDateLabel = isToday ? "TODAY" : selectedDate;
  $: latestStressValue = getLatestStressValue(dailyInfo?.stress ?? null);
  $: stressPlotPath = getStressPlotPath(dailyInfo?.stress ?? null);
  $: activities = dailyInfo?.activities ?? [];
  let activityTypeOptions: ActivityTypeOption[] = [];
  let editingActivity: DailyActivitySummary | null = null;
  let selectedActivityType = "";
  let activityTypeQuery = "";
  let activityStartValue = "";
  let activityEndValue = "";
  let showActivityTypePicker = false;
  let loadingActivityTypes = false;
  let savingActivityType = false;
  let deletingActivity = false;
  let activityTypeError = "";
  $: filteredActivityTypeOptions = activityTypeOptions.filter((option) =>
    option.label.toLowerCase().includes(activityTypeQuery.trim().toLowerCase()),
  );

  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  function formatActivityTime(value: string) {
    return timeFormatter.format(new Date(value));
  }

  function formatActivityStrain(activity: DailyActivitySummary) {
    return activity.strain === null ? "--" : activity.strain.toFixed(1);
  }

  function toTimeFieldValue(value: string) {
    const date = new Date(value);
    const hours = `${date.getHours()}`.padStart(2, "0");
    const minutes = `${date.getMinutes()}`.padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function combineSelectedDateAndTime(time: string) {
    return `${selectedDate}T${time}:00`;
  }

  async function openActivityEditor(activity: DailyActivitySummary) {
    activityTypeError = "";
    editingActivity = activity;
    selectedActivityType = activity.activity;
    activityTypeQuery = "";
    activityStartValue = toTimeFieldValue(activity.start);
    activityEndValue = toTimeFieldValue(activity.end);
    showActivityTypePicker = activity.activity === "Activity";

    if (activityTypeOptions.length > 0 || loadingActivityTypes) {
      return;
    }

    loadingActivityTypes = true;

    try {
      activityTypeOptions = await getActivityTypes();
    } catch (reason) {
      activityTypeError = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loadingActivityTypes = false;
    }
  }

  function handleActivityPress(
    event: MouseEvent | PointerEvent | TouchEvent,
    activity: DailyActivitySummary,
  ) {
    event.stopPropagation();

    if ("preventDefault" in event) {
      event.preventDefault();
    }

    void openActivityEditor(activity);
  }

  function closeActivityEditor() {
    if (savingActivityType || deletingActivity) {
      return;
    }

    editingActivity = null;
    selectedActivityType = "";
    activityTypeQuery = "";
    activityStartValue = "";
    activityEndValue = "";
    showActivityTypePicker = false;
    activityTypeError = "";
  }

  async function saveActivityType() {
    if (!editingActivity || !activityStartValue || !activityEndValue) {
      return;
    }

    savingActivityType = true;
    activityTypeError = "";

    try {
      await updateActivity(
        editingActivity.start,
        combineSelectedDateAndTime(activityStartValue),
        combineSelectedDateAndTime(activityEndValue),
        selectedActivityType,
      );
      await onRefreshActivities();
    } catch (reason) {
      activityTypeError = reason instanceof Error ? reason.message : String(reason);
    } finally {
      savingActivityType = false;
    }

    if (!activityTypeError) {
      closeActivityEditor();
    }
  }

  async function removeActivity() {
    if (!editingActivity) {
      return;
    }

    deletingActivity = true;
    activityTypeError = "";

    try {
      await deleteActivity(editingActivity.start);
      await onRefreshActivities();
    } catch (reason) {
      activityTypeError = reason instanceof Error ? reason.message : String(reason);
    } finally {
      deletingActivity = false;
    }

    if (!activityTypeError) {
      closeActivityEditor();
    }
  }
</script>

<section
  class="selected-whoop-page"
  role="group"
  aria-label="Selected WHOOP dashboard"
  on:touchstart={appStore.pages.selectedWhoop.handlePullStart}
  on:touchmove={appStore.pages.selectedWhoop.handlePullMove}
  on:touchend={appStore.pages.selectedWhoop.resetPullSync}
  on:touchcancel={appStore.pages.selectedWhoop.resetPullSync}
>
  <div class="dashboard-shell">
    <div
      class:revealed={$pullSyncRevealPx > 0}
      class="pull-sync"
      style={`height: ${$pullSyncRevealPx}px;`}
    >
      <p>Latest Sync {latestSyncLabel}</p>
    </div>

    <header class="topbar">
      <div class="date-switcher" aria-label="Current day">
        <button
          class="switcher-arrow"
          type="button"
          aria-label="Previous day"
          on:click={onPreviousDate}
          disabled={!canSelectPreviousDate}
        >
          ‹
        </button>
        <span class="switcher-label">{currentDateLabel}</span>
        <button
          class="switcher-arrow"
          type="button"
          aria-label="Next day"
          on:click={onNextDate}
          disabled={isToday}
        >
          ›
        </button>
      </div>

      <div class="status-actions">
        <button
          class:state-connected={getDeviceState(whoop, reconnecting) === "connected"}
          class:state-error={getDeviceState(whoop, reconnecting) === "error"}
          class:state-syncing={getDeviceState(whoop, reconnecting) === "syncing"}
          class="device-button"
          type="button"
          aria-label="Open device screen"
          on:click={onOpenDeviceManagement}
          disabled={clearing}
        >
          <span class="device-glyph" aria-hidden="true">
            <span class="watch-strap watch-strap-top"></span>
            <span class="watch-body">
              <span class="watch-screen"></span>
            </span>
            <span class="watch-strap watch-strap-bottom"></span>
          </span>
        </button>
      </div>
    </header>

    <section class="stats-grid" aria-label="Daily summaries">
      {#each statCards as stat}
        <article class="stat-card">
          <div class="stat-ring">
            <span>{stat.value}</span>
          </div>
          <p>{stat.label}</p>
        </article>
      {/each}
    </section>

    <section class="monitor-grid" aria-label="Monitor cards">
      {#each monitorCards as card, index}
        <button
          class="monitor-card monitor-card-button"
          type="button"
          on:click={index === 0 ? onOpenHealthMonitor : onOpenStressMonitor}
        >
          <div class="monitor-head">
            <h2>{card.title}</h2>
            <span aria-hidden="true">›</span>
          </div>
          <div class="monitor-body">
            {#if index === 1}
              <div class="stress-preview">
                <div class="stress-preview-head">
                  <strong class="stress-preview-value">{latestStressValue}</strong>
                  <span class="stress-preview-label">Latest stress</span>
                </div>
                {#if stressPlotPath}
                  <svg
                    class="stress-preview-plot"
                    viewBox="0 0 240 56"
                    aria-hidden="true"
                    preserveAspectRatio="none"
                  >
                    <path d={stressPlotPath} />
                  </svg>
                {:else}
                  <p>No synced stress data</p>
                {/if}
              </div>
            {:else}
              <div class="home-health-metrics" aria-label="Health summary">
                {#each healthOverviewMetrics as metric}
                  <div class="home-health-metric">
                    <div class="home-health-metric__head">
                      <span>{metric.short}</span>
                      <span class={`badge badge--${metric.trend.tone}`}>{metric.trend.label}</span>
                    </div>
                    <strong>{metric.value}</strong>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </button>
      {/each}
    </section>

    <section class="day-section" aria-labelledby="my-day-title">
      <div class="section-head">
        <h2 id="my-day-title">My Day</h2>
      </div>

      <article class="activity-card">
        <div class="activity-head">
          <p>{isToday ? "Today's Activities" : "Activities"}</p>
          <span>{activities.length}</span>
        </div>
        {#if activities.length > 0}
          <div class="activity-list" aria-label="Daily activities">
            {#each activities as activity}
              <button
                class="activity-row activity-row-button"
                type="button"
                on:click={(event) => handleActivityPress(event, activity)}
                on:pointerup={(event) => handleActivityPress(event, activity)}
                on:touchend={(event) => handleActivityPress(event, activity)}
              >
                <div class="activity-copy">
                  <h3>{activity.activity}</h3>
                  <p>
                    {formatActivityTime(activity.start)} - {formatActivityTime(activity.end)}
                  </p>
                </div>
                <span class="activity-duration">{formatActivityStrain(activity)}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="activity-empty">
            <p>No activities recorded for this day.</p>
          </div>
        {/if}
      </article>
    </section>

    {#if editingActivity}
      <div
        class="activity-modal-backdrop"
        role="button"
        tabindex="0"
        aria-label="Close activity editor"
        on:click={closeActivityEditor}
        on:keydown={(event) => {
          if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            closeActivityEditor();
          }
        }}
      >
        <div
          class="activity-modal"
          aria-labelledby="activity-modal-title"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          on:click|stopPropagation
          on:keydown|stopPropagation
        >
          <div class="activity-modal-head">
            <div>
              <p class="activity-modal-eyebrow">Edit Activity</p>
              <h2 id="activity-modal-title">{editingActivity.activity}</h2>
            </div>
            <button
              class="activity-modal-close"
              type="button"
              aria-label="Close activity editor"
              on:click={closeActivityEditor}
              disabled={savingActivityType || deletingActivity}
            >
              ×
            </button>
          </div>

          <p class="activity-modal-time">
            {formatActivityTime(editingActivity.start)} - {formatActivityTime(editingActivity.end)}
          </p>

          <div class="activity-time-grid">
            <label class="activity-modal-field">
              <span>Start time</span>
              <input
                type="time"
                bind:value={activityStartValue}
                disabled={savingActivityType || deletingActivity}
              />
            </label>

            <label class="activity-modal-field">
              <span>End time</span>
              <input
                type="time"
                bind:value={activityEndValue}
                disabled={savingActivityType || deletingActivity}
              />
            </label>
          </div>

          <label class="activity-modal-field">
            <span>Activity type</span>
            <button
              class="activity-type-trigger"
              type="button"
              on:click={() => {
                showActivityTypePicker = !showActivityTypePicker;
              }}
              disabled={loadingActivityTypes || savingActivityType || deletingActivity}
            >
              <span>{selectedActivityType || "Activity"}</span>
              <span aria-hidden="true">{showActivityTypePicker ? "▲" : "▼"}</span>
            </button>
          </label>

          {#if showActivityTypePicker}
            <label class="activity-modal-field">
              <span>Find activity type</span>
              <input
                type="text"
                bind:value={activityTypeQuery}
                placeholder="Search activities"
                disabled={loadingActivityTypes || savingActivityType || deletingActivity}
              />
            </label>

            <div class="activity-type-list" aria-label="Activity type options">
              {#if loadingActivityTypes}
                <p class="activity-type-placeholder">Loading activity types...</p>
              {:else if filteredActivityTypeOptions.length > 0}
                {#each filteredActivityTypeOptions as option}
                  <button
                    class:active={selectedActivityType === option.value}
                    class="activity-type-option"
                    type="button"
                    on:click={() => {
                      selectedActivityType = option.value;
                      showActivityTypePicker = false;
                    }}
                    disabled={savingActivityType || deletingActivity}
                  >
                    <span>{option.label}</span>
                    {#if selectedActivityType === option.value}
                      <span aria-hidden="true">✓</span>
                    {/if}
                  </button>
                {/each}
              {:else}
                <p class="activity-type-placeholder">No matching activity types.</p>
              {/if}
            </div>
          {/if}

          {#if activityTypeError}
            <p class="activity-modal-error">{activityTypeError}</p>
          {/if}

          <div class="activity-modal-actions">
            <button
              class="activity-modal-delete"
              type="button"
              on:click={() => void removeActivity()}
              disabled={savingActivityType || deletingActivity}
            >
              {deletingActivity ? "Deleting..." : "Delete"}
            </button>
            <button
              type="button"
              on:click={closeActivityEditor}
              disabled={savingActivityType || deletingActivity}
            >
              Cancel
            </button>
            <button
              class="activity-modal-save"
              type="button"
              on:click={() => void saveActivityType()}
              disabled={
                loadingActivityTypes ||
                savingActivityType ||
                deletingActivity ||
                !selectedActivityType
              }
            >
              {savingActivityType ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .monitor-card-button {
    appearance: none;
    background: none;
    border: 0;
    color: inherit;
    cursor: pointer;
    display: block;
    font: inherit;
    margin: 0;
    padding: 0;
    text-align: left;
    width: 100%;
  }

  .activity-row-button {
    appearance: none;
    border: 0;
    color: inherit;
    cursor: pointer;
    font: inherit;
    text-align: left;
    width: 100%;
  }

  .stress-preview {
    display: grid;
    gap: 0.5rem;
    width: 100%;
  }

  .stress-preview-head {
    align-items: baseline;
    display: flex;
    gap: 0.5rem;
    justify-content: space-between;
  }

  .stress-preview-value {
    font-size: 1.35rem;
    line-height: 1;
  }

  .stress-preview-label {
    color: rgba(191, 196, 208, 0.72);
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .stress-preview-plot {
    display: block;
    height: 3.5rem;
    width: 100%;
  }

  .stress-preview-plot path {
    fill: none;
    stroke: rgba(243, 186, 74, 0.95);
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 3;
  }

  .activity-modal-delete {
    background: rgba(176, 44, 44, 0.14);
    color: #ff9b9b;
  }
</style>
