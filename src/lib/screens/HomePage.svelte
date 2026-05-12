<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import type { ActiveScreen } from "$lib/stores/homePage";
  import { appStore } from "$lib/stores/appStore";
  import AddActivityScreen from "$lib/screens/AddActivityScreen.svelte";
  import DeviceManagementScreen from "$lib/screens/DeviceManagementScreen.svelte";
  import HealthMonitorScreen from "$lib/screens/HealthMonitorScreen.svelte";
  import HealthPageScreen from "$lib/screens/HealthPageScreen.svelte";
  import MoreScreen from "$lib/screens/MoreScreen.svelte";
  import ScanForDevices from "$lib/screens/ScanForDevices.svelte";
  import StartActivityScreen from "$lib/screens/StartActivityScreen.svelte";
  import SelectedWhoopScreen from "$lib/screens/SelectedWhoopScreen.svelte";
  import StressMonitorScreen from "$lib/screens/StressMonitorScreen.svelte";
  import "./HomePage.css";
  const selectedWhoop = appStore.selectedWhoop.current;
  const initializing = appStore.home.initializing;
  const startupError = appStore.home.startupError;
  const selectedWhoopError = appStore.home.selectedWhoopError;
  const clearing = appStore.home.clearing;
  const reconnecting = appStore.home.reconnecting;
  const rebooting = appStore.home.rebooting;
  const erasing = appStore.home.erasing;
  const activeScreen = appStore.home.activeScreen;
  const hasSelectedWhoopBefore = appStore.home.hasSelectedWhoopBefore;
  const latestSyncLabel = appStore.home.latestSyncLabel;
  const dailyInfo = appStore.home.dailyInfo;
  const selectedDate = appStore.home.selectedDate;
  const canSelectPreviousDate = appStore.home.canSelectPreviousDate;
  const isSelectedDateToday = appStore.home.isSelectedDateToday;
  const showPrimaryNav = appStore.home.showPrimaryNav;
  let showActivityMenu = false;

  const androidBackScreens = new Set<ActiveScreen>([
    "device",
    "add-activity",
    "start-activity",
    "health-monitor",
    "stress-monitor",
  ]);

  const fallbackBackTarget: Partial<Record<ActiveScreen, ActiveScreen>> = {
    device: "main",
    "add-activity": "main",
    "start-activity": "main",
    "health-monitor": "health",
    "stress-monitor": "health",
  };

  $: if ($activeScreen !== "main") {
    showActivityMenu = false;
  }

  function toggleActivityMenu() {
    showActivityMenu = !showActivityMenu;
  }

  function closeActivityMenu() {
    showActivityMenu = false;
  }

  function openAddActivity() {
    showActivityMenu = false;
    appStore.home.openAddActivity();
  }

  function openStartActivity() {
    showActivityMenu = false;
    appStore.home.openStartActivity();
  }

  onMount(() => {
    appStore.home.start();

    if (!browser) {
      return () => appStore.home.stop();
    }

    let syncingFromHistory = false;
    let previousScreen: ActiveScreen | null = null;

    window.history.replaceState(
      {
        ...(window.history.state ?? {}),
        openWhoopScreen: "main",
      },
      "",
    );

    const unsubscribe = appStore.home.activeScreen.subscribe((screen) => {
      if (syncingFromHistory) {
        previousScreen = screen;
        return;
      }

      if (!androidBackScreens.has(screen)) {
        window.history.replaceState(
          {
            ...(window.history.state ?? {}),
            openWhoopScreen: screen,
          },
          "",
        );
        previousScreen = screen;
        return;
      }

      if (previousScreen !== screen) {
        window.history.pushState(
          {
            ...(window.history.state ?? {}),
            openWhoopScreen: screen,
          },
          "",
        );
      }

      previousScreen = screen;
    });

    function handlePopState(event: PopStateEvent) {
      const targetScreen =
        (event.state?.openWhoopScreen as ActiveScreen | undefined) ??
        fallbackBackTarget[$activeScreen] ??
        "main";

      syncingFromHistory = true;
      appStore.home.navigateToScreen(targetScreen);
      previousScreen = targetScreen;
      queueMicrotask(() => {
        syncingFromHistory = false;
      });
    }

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      unsubscribe();
      appStore.home.stop();
    };
  });
</script>

{#if $initializing}
  <section class="home-loading-page" aria-labelledby="startup-title">
    <div class="loading-screen">
      <p class="eyebrow">CHECKING SAVED DEVICE</p>
      <h1 id="startup-title">Opening OpenWhoop</h1>
      <p class="subtitle">
        Checking whether the Tauri app already has a saved WHOOP.
      </p>
    </div>
  </section>
{:else if $activeScreen === "scan"}
  <ScanForDevices
    initialError={$startupError}
    mode={$hasSelectedWhoopBefore ? "returning" : "initial"}
    onConnected={appStore.home.handleDeviceConnected}
    onBack={$hasSelectedWhoopBefore ? appStore.home.openDeviceManagement : undefined}
  />
{:else if $selectedWhoop}
  {#if $activeScreen === "device"}
    <DeviceManagementScreen
      whoop={$selectedWhoop}
      latestSyncLabel={$latestSyncLabel}
      error={$selectedWhoopError}
      clearing={$clearing}
      reconnecting={$reconnecting}
      rebooting={$rebooting}
      erasing={$erasing}
      showReconnect={!$selectedWhoop.connected}
      onReconnect={appStore.home.reconnectSavedWhoop}
      onChooseAnother={appStore.home.unselectWhoop}
      onReboot={appStore.home.rebootSelectedWhoop}
      onErase={appStore.home.eraseSelectedWhoopData}
      onOpenScan={appStore.home.openDeviceChooser}
      onBack={appStore.home.closeDeviceManagement}
    />
  {:else if $activeScreen === "health-monitor"}
    <HealthMonitorScreen
      whoop={$selectedWhoop}
      onBack={appStore.home.closeHealthMonitor}
    />
  {:else if $activeScreen === "add-activity"}
    <AddActivityScreen
      onBack={appStore.home.closeActivityFlow}
      onCreated={appStore.home.refreshSelectedDate}
    />
  {:else if $activeScreen === "start-activity"}
    <StartActivityScreen
      whoop={$selectedWhoop}
      onBack={appStore.home.closeActivityFlow}
    />
  {:else if $activeScreen === "stress-monitor"}
    <StressMonitorScreen
      whoop={$selectedWhoop}
      dailyInfo={$dailyInfo}
      onBack={appStore.home.closeStressMonitor}
    />
  {:else}
    <section class="primary-shell">
      {#if $activeScreen === "health"}
        <HealthPageScreen
          whoop={$selectedWhoop}
          dailyInfo={$dailyInfo}
          onOpenHealthMonitor={appStore.home.openHealthMonitor}
          onOpenStressMonitor={appStore.home.openStressMonitor}
        />
      {:else if $activeScreen === "more"}
        <MoreScreen />
      {:else}
        <SelectedWhoopScreen
          whoop={$selectedWhoop}
          dailyInfo={$dailyInfo}
          selectedDate={$selectedDate}
          canSelectPreviousDate={$canSelectPreviousDate}
          isToday={$isSelectedDateToday}
          latestSyncLabel={$latestSyncLabel}
          clearing={$clearing}
          reconnecting={$reconnecting}
          onOpenDeviceManagement={appStore.home.openDeviceManagement}
          onOpenHealthMonitor={appStore.home.openHealthMonitor}
          onOpenStressMonitor={appStore.home.openStressMonitor}
          onPreviousDate={appStore.home.selectPreviousDate}
          onNextDate={appStore.home.selectNextDate}
          onRefreshActivities={appStore.home.refreshSelectedDate}
        />
      {/if}

      {#if $showPrimaryNav}
        {#if $activeScreen === "main"}
          {#if showActivityMenu}
            <button
              class="activity-menu-backdrop"
              type="button"
              aria-label="Close activity menu"
              on:click={closeActivityMenu}
            ></button>

            <div class="activity-menu" aria-label="Activity actions">
              <button class="activity-menu-item" type="button" on:click={openStartActivity}>
                <span class="activity-menu-icon" aria-hidden="true">O</span>
                <span>Start Activity</span>
              </button>

              <button class="activity-menu-item" type="button" on:click={openAddActivity}>
                <span class="activity-menu-icon activity-menu-icon--plus" aria-hidden="true">+</span>
                <span>Add Activity</span>
              </button>
            </div>
          {/if}

          <button
            class:active={showActivityMenu}
            class="activity-launcher"
            type="button"
            aria-label="Open activity actions"
            aria-expanded={showActivityMenu}
            on:click={toggleActivityMenu}
          >
            +
          </button>
        {/if}

        <nav class="shared-bottom-nav" aria-label="Primary navigation">
          <button
            class:active={$activeScreen === "main"}
            class="shared-nav-item"
            type="button"
            aria-current={$activeScreen === "main" ? "page" : undefined}
            on:click={appStore.home.openMainPage}
          >
            <span aria-hidden="true">⌂</span>
            <span>Home</span>
          </button>

          <button
            class:active={$activeScreen === "health"}
            class="shared-nav-item"
            type="button"
            aria-current={$activeScreen === "health" ? "page" : undefined}
            on:click={appStore.home.openHealthPage}
          >
            <span aria-hidden="true">♡</span>
            <span>Health</span>
          </button>

          <button
            class:active={$activeScreen === "more"}
            class="shared-nav-item"
            type="button"
            aria-current={$activeScreen === "more" ? "page" : undefined}
            on:click={appStore.home.openMorePage}
          >
            <span aria-hidden="true">☰</span>
            <span>More</span>
          </button>
        </nav>
      {/if}
    </section>
  {/if}
{:else}
  <ScanForDevices
    initialError={$startupError}
    mode={$hasSelectedWhoopBefore ? "returning" : "initial"}
    onConnected={appStore.home.handleDeviceConnected}
    onBack={$hasSelectedWhoopBefore ? appStore.home.openDeviceManagement : undefined}
  />
{/if}
