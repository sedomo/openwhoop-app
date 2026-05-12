<script lang="ts">
  import { createActivity, getActivityTypes } from "$lib/api";
  import type { ActivityTypeOption } from "$lib/api/interfaces";
  import { onMount } from "svelte";

  export let onBack: () => void = () => undefined;
  export let onCreated: () => Promise<void> | void = () => undefined;

  let activityTypeOptions: ActivityTypeOption[] = [];
  let selectedActivity = "";
  const today = new Date();
  const isoToday = `${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}-${`${today.getDate()}`.padStart(2, "0")}`;
  let startDate = isoToday;
  let endDate = isoToday;
  let startTime = "14:36";
  let endTime = "15:36";
  let loadingActivityTypes = false;
  let savingActivity = false;
  let activityError = "";
  $: selectedActivityText =
    activityTypeOptions.find((option) => option.value === selectedActivity)?.label ??
    "Select activity";
  $: startDateLabel = startDate === isoToday ? "Today" : formatDateChip(startDate);
  $: endDateLabel = endDate === isoToday ? "Today" : formatDateChip(endDate);

  onMount(() => {
    void loadActivityTypes();
  });

  async function loadActivityTypes() {
    loadingActivityTypes = true;
    activityError = "";

    try {
      activityTypeOptions = await getActivityTypes();
      selectedActivity = activityTypeOptions[0]?.value ?? "";
    } catch (reason) {
      activityError = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loadingActivityTypes = false;
    }
  }

  function formatDateChip(value: string) {
    const [year, month, day] = value.split("-");
    return `${day}.${month}.`;
  }

  function combineDateAndTime(date: string, time: string) {
    return `${date}T${time}:00`;
  }

  async function saveActivity() {
    if (!selectedActivity || !startDate || !endDate || !startTime || !endTime) {
      activityError = "Choose an activity, start date/time, and end date/time.";
      return;
    }

    savingActivity = true;
    activityError = "";

    try {
      await createActivity(
        combineDateAndTime(startDate, startTime),
        combineDateAndTime(endDate, endTime),
        selectedActivity,
      );
      await onCreated();
      onBack();
    } catch (reason) {
      activityError = reason instanceof Error ? reason.message : String(reason);
    } finally {
      savingActivity = false;
    }
  }
</script>

<section class="activity-entry-screen" aria-labelledby="add-activity-title">
  <header class="entry-topbar">
    <button class="entry-close" type="button" aria-label="Close add activity" on:click={onBack}>
      x
    </button>
    <div class="entry-grabber" aria-hidden="true"></div>
    <h1 id="add-activity-title">Add Activity</h1>
  </header>

  <div class="entry-shell">
    <label class="entry-select-card">
      <span class="entry-select-copy">{loadingActivityTypes ? "Loading activities..." : selectedActivityText}</span>
      <span class="entry-chevron" aria-hidden="true">></span>
      <select bind:value={selectedActivity} aria-label="Select activity" disabled={loadingActivityTypes || activityTypeOptions.length === 0}>
        {#if activityTypeOptions.length === 0}
          <option value="">{loadingActivityTypes ? "Loading..." : "No activities available"}</option>
        {:else}
          {#each activityTypeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        {/if}
      </select>
    </label>

    <section class="entry-section" aria-labelledby="time-section-title">
      <div class="entry-section-label">
        <span id="time-section-title">Time</span>
      </div>

      <div class="entry-time-row">
        <span class="entry-time-row-label">Start Time</span>
        <div class="entry-time-controls">
          <label class="entry-chip entry-chip-select">
            <span>{startDateLabel}</span>
            <input type="date" bind:value={startDate} aria-label="Start date" />
          </label>
          <label class="entry-chip entry-chip-select entry-time-input">
            <span>{startTime}</span>
            <input id="start-time" type="time" bind:value={startTime} aria-label="Start time" />
          </label>
        </div>
      </div>

      <div class="entry-time-row">
        <span class="entry-time-row-label">End Time</span>
        <div class="entry-time-controls">
          <label class="entry-chip entry-chip-select">
            <span>{endDateLabel}</span>
            <input type="date" bind:value={endDate} aria-label="End date" />
          </label>
          <label class="entry-chip entry-chip-select entry-time-input">
            <span>{endTime}</span>
            <input id="end-time" type="time" bind:value={endTime} aria-label="End time" />
          </label>
        </div>
      </div>
    </section>

    {#if activityError}
      <p class="entry-error">{activityError}</p>
    {/if}
  </div>

  <div class="entry-footer">
    <button
      class="entry-save"
      type="button"
      disabled={savingActivity || loadingActivityTypes}
      on:click={saveActivity}
    >
      {savingActivity ? "Saving..." : "Save"}
    </button>
  </div>
</section>

<style>
  .activity-entry-screen {
    min-height: 100vh;
    min-height: 100dvh;
    padding: max(0.85rem, env(safe-area-inset-top, 0px)) 1rem
      calc(env(safe-area-inset-bottom, 0px) + 1.4rem);
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 1.1rem;
    background:
      radial-gradient(circle at top, rgba(99, 119, 131, 0.22), transparent 32%),
      linear-gradient(180deg, #33404a 0%, #1d272d 100%);
    color: #f2f5f7;
  }

  .entry-topbar {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 0.75rem;
  }

  .entry-close,
  .entry-save {
    border: 0;
    font: inherit;
  }

  .entry-close {
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    background: transparent;
    color: rgba(255, 255, 255, 0.9);
    font-size: 1.45rem;
    box-shadow: none;
  }

  .entry-grabber {
    justify-self: center;
    width: 4.5rem;
    height: 0.34rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
  }

  .entry-topbar h1 {
    margin: 0;
    justify-self: end;
    font-size: 1rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .entry-shell {
    display: grid;
    align-content: start;
    gap: 1.8rem;
  }

  .entry-select-card {
    width: 100%;
    padding: 1.2rem 1.1rem;
    border-radius: 1rem;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 0.9rem;
    background: rgba(72, 81, 89, 0.78);
    color: #f5f7f8;
  }

  .entry-select-card {
    position: relative;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
  }

  .entry-select-copy {
    min-width: 0;
    font-weight: 700;
  }

  .entry-select-card select {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .entry-chevron {
    color: rgba(255, 255, 255, 0.42);
    font-size: 1.5rem;
  }

  .entry-section {
    display: grid;
    gap: 1rem;
  }

  .entry-section-label {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    color: rgba(230, 236, 240, 0.7);
    font-size: 0.84rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.14em;
  }

  .entry-section-label::after {
    content: "";
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
  }

  .entry-time-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.9rem;
  }

  .entry-time-row-label {
    font-size: 0.9rem;
    font-weight: 700;
  }

  .entry-time-controls {
    display: flex;
    gap: 0.45rem;
  }

  .entry-chip {
    position: relative;
    min-width: 4rem;
    min-width: 4rem;
    padding: 0.72rem 0.8rem;
    border-radius: 0.45rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(72, 81, 89, 0.78);
    color: #eef2f4;
    font-weight: 700;
  }

  .entry-chip-select {
    cursor: pointer;
  }

  .entry-chip-select input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .entry-time-input {
    width: 5.2rem;
    text-align: center;
    letter-spacing: 0.04em;
  }

  .entry-error {
    margin: 0;
    color: #ff9aa7;
    font-size: 0.92rem;
  }

  .entry-footer {
    display: flex;
    justify-content: center;
  }

  .entry-save {
    width: min(100%, 23rem);
    padding: 1rem 1.25rem;
    border-radius: 999px;
    background: transparent;
    color: #0b6a4e;
    font-size: 1rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    box-shadow: inset 0 0 0 2px rgba(10, 108, 79, 0.8);
  }
</style>
