<script lang="ts">
  import { getActivityTypes } from "$lib/api";
  import type { ActivityTypeOption } from "$lib/api/interfaces";
  import type { SelectedWhoop } from "$lib/stores/selectedWhoop";
  import { onMount } from "svelte";

  export let whoop: SelectedWhoop;
  export let onBack: () => void = () => undefined;

  let activityTypeOptions: ActivityTypeOption[] = [];
  let selectedActivity = "";
  let trackRoute = false;
  let loadingActivityTypes = false;
  $: selectedActivityText =
    activityTypeOptions.find((option) => option.value === selectedActivity)?.label ??
    "Select activity";

  onMount(() => {
    void loadActivityTypes();
  });

  async function loadActivityTypes() {
    loadingActivityTypes = true;

    try {
      activityTypeOptions = await getActivityTypes();
      selectedActivity = activityTypeOptions[0]?.value ?? "";
    } finally {
      loadingActivityTypes = false;
    }
  }
</script>

<section class="start-activity-screen" aria-labelledby="start-activity-title">
  <header class="start-activity-topbar">
    <button class="start-activity-close" type="button" aria-label="Back" on:click={onBack}>
      x
    </button>
    <label class="start-activity-picker">
      <span id="start-activity-title">{loadingActivityTypes ? "Loading..." : selectedActivityText}</span>
      <select bind:value={selectedActivity} aria-label="Select activity">
        {#if activityTypeOptions.length === 0}
          <option value="">Select activity</option>
        {:else}
          {#each activityTypeOptions as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        {/if}
      </select>
    </label>
  </header>

  <div class="start-activity-shell">
    <div class="start-activity-toggle">
      <span>Track Route</span>
      <button
        class:active={trackRoute}
        class="route-toggle"
        type="button"
        role="switch"
        aria-label="Toggle track route"
        aria-checked={trackRoute}
        on:click={() => (trackRoute = !trackRoute)}
      >
        <span></span>
      </button>
    </div>
  </div>

  <footer class="start-activity-footer">
    <p class="whoop-status">{whoop.connected ? "Device ready" : "Device disconnected"}</p>

    <button class="start-activity-button" type="button">Start Activity</button>
  </footer>
</section>

<style>
  .start-activity-screen {
    min-height: 100vh;
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto 1fr auto;
    background:
      radial-gradient(circle at top left, rgba(37, 123, 179, 0.28), transparent 28%),
      linear-gradient(180deg, #123e59 0%, #041926 76%, #021019 100%);
    color: #f4f8fb;
  }

  .start-activity-topbar {
    padding: max(1rem, env(safe-area-inset-top, 0px)) 1rem 0;
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .start-activity-close,
  .route-toggle,
  .start-activity-button {
    border: 0;
    font: inherit;
  }

  .start-activity-close {
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    background: transparent;
    color: #f4f8fb;
    font-size: 1.45rem;
    box-shadow: none;
  }

  .start-activity-picker {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    background: transparent;
    color: #f4f8fb;
    font-size: 1.15rem;
    font-weight: 700;
  }

  .start-activity-picker select {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .start-activity-shell {
    padding: 1rem 1.15rem 0;
    min-height: 0;
  }

  .start-activity-toggle {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 0.8rem;
    color: rgba(240, 244, 247, 0.58);
    font-size: 0.88rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  .route-toggle {
    width: 3.35rem;
    height: 1.9rem;
    padding: 0.15rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
    box-shadow: none;
  }

  .route-toggle span {
    display: block;
    width: 1.6rem;
    height: 1.6rem;
    border-radius: 50%;
    background: #eef3f7;
    transition: transform 160ms ease;
  }

  .route-toggle.active {
    background: rgba(37, 163, 237, 0.52);
  }

  .route-toggle.active span {
    transform: translateX(1.45rem);
  }

  .whoop-status {
    margin: 0 0 1rem;
    text-align: center;
    color: rgba(244, 248, 251, 0.74);
    font-size: 0.9rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .start-activity-footer {
    padding: 0.9rem 1rem calc(env(safe-area-inset-bottom, 0px) + 1rem);
    border-radius: 1.6rem 1.6rem 0 0;
    background: #f7f7f7;
    color: #10171d;
    box-shadow: 0 -16px 34px rgba(0, 0, 0, 0.18);
  }

  .start-activity-button {
    width: 100%;
    padding: 1.05rem 1.2rem;
    border-radius: 999px;
    background: linear-gradient(180deg, #28aaed, #1e9ae4);
    color: #fff;
    font-size: 1rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
</style>
