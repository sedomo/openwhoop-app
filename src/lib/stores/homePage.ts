import { isTauri } from "@tauri-apps/api/core";
import { browser } from "$app/environment";
import { derived, get, writable } from "svelte/store";
import {
  clearSelectedWhoopAddress,
  connectToSavedWhoop,
  eraseWhoopDeviceData,
  getEarliestReadingTime,
  getDailyInfo,
  getLast7DayDailyStatsAverage,
  getLatestDailyStats,
  getSavedWhoopRuntimeStatus,
  getWhoopSelectionState,
  rebootWhoopDevice,
} from "$lib/api";
import type {
  DailyInfoSummary,
  DailyStatsAverageSummary,
  DailyStatsSummary,
  EarliestReadingTimeSummary,
  SavedWhoopConnectionResult,
  SavedWhoopRuntimeStatus,
} from "$lib/api/interfaces";
import {
  clearSelectedWhoop,
  selectedWhoop,
  setSelectedWhoop,
  type SelectedWhoop,
} from "$lib/stores/selectedWhoop";
import { logApp } from "$lib/utils/logging";

export type ActiveScreen =
  | "main"
  | "device"
  | "scan"
  | "health"
  | "more"
  | "add-activity"
  | "start-activity"
  | "health-monitor"
  | "stress-monitor";

const emptySyncLabel = "--:--";
const rustBackgroundJobIntervalMs = 5000;
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function sameWhoopAddress(left: string, right: string) {
  return left.trim().toUpperCase() === right.trim().toUpperCase();
}

function todayIsoDate() {
  return dateFormatter.format(new Date());
}

function previousIsoDate(date: string) {
  const previous = new Date(`${date}T00:00:00`);
  previous.setDate(previous.getDate() - 1);
  return dateFormatter.format(previous);
}

function nextIsoDate(date: string) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + 1);
  return dateFormatter.format(next);
}

function createUnselectedWhoop(): SelectedWhoop {
  return {
    address: "",
    name: "",
    generation: "No device selected",
    rssi: null,
    restoredFromState: true,
    connected: false,
  };
}

export function createHomePageState() {
  const initializing = writable(true);
  const startupError = writable("");
  const selectedWhoopError = writable("");
  const clearing = writable(false);
  const reconnecting = writable(false);
  const rebooting = writable(false);
  const erasing = writable(false);
  const activeScreen = writable<ActiveScreen>("main");
  const hasSelectedWhoopBefore = writable(false);
  const latestSyncLabel = writable(emptySyncLabel);
  const dailyInfo = writable<DailyInfoSummary | null>(null);
  const latestDailyStats = writable<DailyStatsSummary | null>(null);
  const last7DayDailyStatsAverage = writable<DailyStatsAverageSummary | null>(null);
  const selectedDate = writable(todayIsoDate());
  const canSelectPreviousDate = writable(false);
  const earliestReadingTime = writable<EarliestReadingTimeSummary | null>(null);
  const isSelectedDateToday = derived(selectedDate, ($selectedDate) => {
    return $selectedDate === todayIsoDate();
  });
  const showPrimaryNav = derived(activeScreen, ($activeScreen) => {
    return (
      $activeScreen === "main" ||
      $activeScreen === "health" ||
      $activeScreen === "more"
    );
  });

  let rustBackgroundJobBusy = false;
  let rustBackgroundJobTimer: number | null = null;
  const stopSelectedWhoopTracking = selectedWhoop.subscribe((whoop) => {
    if (whoop?.address.trim()) {
      hasSelectedWhoopBefore.set(true);
    }
  });

  function setUnselectedWhoopState() {
    logApp(
      "info",
      "home.selection",
      "Switching to the unselected WHOOP state.",
    );
    hasSelectedWhoopBefore.set(true);
    latestSyncLabel.set(emptySyncLabel);
    dailyInfo.set(null);
    latestDailyStats.set(null);
    last7DayDailyStatsAverage.set(null);
    selectedDate.set(todayIsoDate());
    earliestReadingTime.set(null);
    canSelectPreviousDate.set(false);
    setSelectedWhoop(createUnselectedWhoop());
  }

  function applySavedWhoopResult(savedWhoop: SavedWhoopConnectionResult) {
    logApp(
      "info",
      "home.savedWhoop",
      "Applied saved WHOOP connection result.",
      {
        address: savedWhoop.address,
        connected: savedWhoop.connected,
        generation: savedWhoop.generation,
        error: savedWhoop.error,
      },
    );
    selectedWhoopError.set(savedWhoop.error ?? "");
    setSelectedWhoop({
      address: savedWhoop.address,
      name: savedWhoop.name ?? "",
      generation: savedWhoop.generation ?? "",
      rssi: savedWhoop.rssi,
      restoredFromState: true,
      connected: savedWhoop.connected,
    });
  }

  async function reconnectSavedWhoop() {
    logApp("info", "home.reconnect", "Trying to reconnect the saved WHOOP.");
    selectedWhoopError.set("");
    reconnecting.set(true);

    try {
      const savedWhoop = await connectToSavedWhoop();

      if (savedWhoop) {
        applySavedWhoopResult(savedWhoop);
        void loadEarliestReadingTime();
        void refreshHealthStats();
      } else {
        logApp(
          "warn",
          "home.reconnect",
          "No saved WHOOP was available to reconnect.",
        );
      }
    } catch (reason) {
      logApp(
        "error",
        "home.reconnect",
        "Saved WHOOP reconnect failed.",
        reason,
      );
      selectedWhoopError.set(toErrorMessage(reason));
    } finally {
      reconnecting.set(false);
    }
  }

  async function initializeHomePage() {
    logApp("info", "home.init", "Initializing the home screen.");
    startupError.set("");
    selectedWhoopError.set("");
    activeScreen.set("main");
    latestSyncLabel.set(emptySyncLabel);
    dailyInfo.set(null);
    latestDailyStats.set(null);
    last7DayDailyStatsAverage.set(null);
    selectedDate.set(todayIsoDate());
    earliestReadingTime.set(null);
    canSelectPreviousDate.set(false);
    clearSelectedWhoop();
    hasSelectedWhoopBefore.set(false);

    if (!isTauri()) {
      logApp(
        "warn",
        "home.init",
        "Tauri APIs are unavailable in this environment.",
      );
      initializing.set(false);
      return;
    }

    try {
      const selectionState = await getWhoopSelectionState();
      logApp(
        "info",
        "home.init",
        "Loaded WHOOP selection state.",
        selectionState,
      );
      hasSelectedWhoopBefore.set(selectionState.hasSelectedWhoop);
      const savedAddress = selectionState.selectedWhoopAddress;

      if (savedAddress) {
        try {
          applyRustRuntimeStatus(await getSavedWhoopRuntimeStatus());
          void loadEarliestReadingTime();
        } catch (reason) {
          logApp(
            "warn",
            "home.init",
            "Unable to load the saved WHOOP runtime status during startup.",
            reason,
          );
        }

        setSelectedWhoop({
          address: savedAddress,
          name: "",
          generation: "",
          rssi: null,
          restoredFromState: true,
          connected: false,
        });
        initializing.set(false);
        logApp(
          "info",
          "home.init",
          "Saved WHOOP found. Starting reconnect flow.",
          {
            address: savedAddress,
          },
        );
        void reconnectSavedWhoop();
        return;
      }

      if (selectionState.hasSelectedWhoop) {
        setUnselectedWhoopState();
        activeScreen.set("device");
        initializing.set(false);
        logApp(
          "info",
          "home.init",
          "Previous WHOOP exists but no active address is selected.",
        );
        return;
      }
    } catch (reason) {
      logApp("error", "home.init", "Home initialization failed.", reason);
      startupError.set(toErrorMessage(reason));
    }

    activeScreen.set("scan");
    initializing.set(false);
    logApp("info", "home.init", "Opening the device scan screen.");
  }

  async function unselectWhoop() {
    logApp("info", "home.device", "Clearing the selected WHOOP.");
    selectedWhoopError.set("");
    startupError.set("");
    activeScreen.set("device");
    clearing.set(true);

    try {
      if (isTauri()) {
        await clearSelectedWhoopAddress();
      }

      setUnselectedWhoopState();
    } catch (reason) {
      logApp(
        "error",
        "home.device",
        "Unable to clear the selected WHOOP.",
        reason,
      );
      selectedWhoopError.set(toErrorMessage(reason));
    } finally {
      clearing.set(false);
    }
  }

  async function rebootSelectedWhoop() {
    const whoop = get(selectedWhoop);

    if (!isTauri() || !whoop) {
      return;
    }

    logApp("info", "home.device", "Rebooting the selected WHOOP.", {
      address: whoop.address,
      generation: whoop.generation,
    });
    selectedWhoopError.set("");
    rebooting.set(true);

    try {
      await rebootWhoopDevice();
      setSelectedWhoop({
        address: whoop.address,
        name: whoop.name,
        generation: whoop.generation,
        rssi: whoop.rssi,
        restoredFromState: true,
        connected: false,
      });
    } catch (reason) {
      logApp("error", "home.device", "WHOOP reboot failed.", reason);
      selectedWhoopError.set(toErrorMessage(reason));
    } finally {
      rebooting.set(false);
    }
  }

  async function eraseSelectedWhoopData() {
    const whoop = get(selectedWhoop);

    if (!isTauri() || !whoop) {
      return;
    }

    logApp("info", "home.device", "Erasing WHOOP data.", {
      address: whoop.address,
      generation: whoop.generation,
    });
    selectedWhoopError.set("");
    erasing.set(true);

    try {
      await eraseWhoopDeviceData();
    } catch (reason) {
      logApp("error", "home.device", "WHOOP erase failed.", reason);
      selectedWhoopError.set(toErrorMessage(reason));
    } finally {
      erasing.set(false);
    }
  }

  function clearRustBackgroundJobTimer() {
    if (browser && rustBackgroundJobTimer !== null) {
      window.clearInterval(rustBackgroundJobTimer);
      rustBackgroundJobTimer = null;
    }
  }

  function applyRustRuntimeStatus(status: SavedWhoopRuntimeStatus) {
    const currentWhoop = get(selectedWhoop);
    const currentLatestSyncLabel = get(latestSyncLabel);
    const nextLatestSyncLabel = status.latestReadingLabel ?? emptySyncLabel;
    const currentDailyInfo = get(dailyInfo);
    const nextDailyInfo =
      get(selectedDate) === todayIsoDate() ? status.dailyInfo : currentDailyInfo;
    const connectedChanged =
      Boolean(currentWhoop?.address?.trim()) &&
      Boolean(status.selectedWhoopAddress) &&
      sameWhoopAddress(
        currentWhoop?.address ?? "",
        status.selectedWhoopAddress ?? "",
      ) &&
      currentWhoop?.connected !== status.connected;
    const latestSyncChanged = currentLatestSyncLabel !== nextLatestSyncLabel;
    const dailyInfoChanged =
      JSON.stringify(currentDailyInfo) !== JSON.stringify(nextDailyInfo);

    if (connectedChanged || latestSyncChanged || dailyInfoChanged) {
      logApp(
        "debug",
        "home.runtimeStatus",
        "Applied runtime status from Rust.",
        {
          selectedWhoopAddress: status.selectedWhoopAddress,
          connectedDeviceAddress: status.connectedDeviceAddress,
          connected: status.connected,
          latestReadingLabel: status.latestReadingLabel,
          dailyInfo: status.dailyInfo,
          backgroundSyncRunning: status.backgroundSync.running,
          heartRateStreamRunning: status.heartRateStream.running,
        },
      );
    }

    latestSyncLabel.set(nextLatestSyncLabel);
    dailyInfo.set(nextDailyInfo);

    if (
      !currentWhoop ||
      !status.selectedWhoopAddress ||
      !sameWhoopAddress(currentWhoop.address, status.selectedWhoopAddress)
    ) {
      return;
    }

    if (currentWhoop.connected === status.connected) {
      return;
    }

    setSelectedWhoop({
      ...currentWhoop,
      connected: status.connected,
    });
  }

  async function runRustBackgroundJob() {
    const whoop = get(selectedWhoop);

    if (
      !browser ||
      !isTauri() ||
      get(initializing) ||
      rustBackgroundJobBusy ||
      get(activeScreen) === "scan" ||
      !whoop?.address?.trim()
    ) {
      return;
    }

    rustBackgroundJobBusy = true;

    try {
      const status = await getSavedWhoopRuntimeStatus();
      applyRustRuntimeStatus(status);
      void loadEarliestReadingTime();
      void refreshHealthStats();
    } catch (reason) {
      logApp(
        "error",
        "home.runtimeStatus",
        "Rust background job failed.",
        reason,
      );
    } finally {
      rustBackgroundJobBusy = false;
    }
  }

  async function loadDailyInfoForDate(date: string) {
    if (!isTauri()) {
      return null;
    }

    return await getDailyInfo(date);
  }

  async function refreshHealthStats() {
    if (!isTauri()) {
      latestDailyStats.set(null);
      last7DayDailyStatsAverage.set(null);
      return;
    }

    try {
      const [latestStats, averageStats] = await Promise.all([
        getLatestDailyStats(),
        getLast7DayDailyStatsAverage(),
      ]);

      latestDailyStats.set(latestStats);
      last7DayDailyStatsAverage.set(averageStats);
    } catch (reason) {
      logApp(
        "warn",
        "home.healthStats",
        "Unable to load health stats.",
        reason,
      );
      latestDailyStats.set(null);
      last7DayDailyStatsAverage.set(null);
    }
  }

  async function loadEarliestReadingTime() {
    if (!isTauri()) {
      earliestReadingTime.set(null);
      canSelectPreviousDate.set(false);
      return;
    }

    try {
      const earliest = await getEarliestReadingTime();
      earliestReadingTime.set(earliest);
      updatePreviousDateAvailability(get(selectedDate), earliest);
    } catch (reason) {
      logApp(
        "warn",
        "home.dailyInfo",
        "Unable to load earliest reading time.",
        reason,
      );
      earliestReadingTime.set(null);
      canSelectPreviousDate.set(false);
    }
  }

  function updatePreviousDateAvailability(
    date: string,
    earliest = get(earliestReadingTime),
  ) {
    canSelectPreviousDate.set(
      earliest !== null && previousIsoDate(date) >= earliest.isoDate,
    );
  }

  async function setDisplayedDate(date: string) {
    const info = await loadDailyInfoForDate(date);
    dailyInfo.set(info);
    selectedDate.set(date);
    updatePreviousDateAvailability(date);
  }

  async function refreshSelectedDate() {
    await setDisplayedDate(get(selectedDate));
  }

  async function selectPreviousDate() {
    if (!get(canSelectPreviousDate)) {
      return;
    }

    const current = get(selectedDate);
    await setDisplayedDate(previousIsoDate(current));
  }

  async function selectNextDate() {
    const current = get(selectedDate);
    const today = todayIsoDate();
    if (current >= today) {
      return;
    }

    const nextIso = nextIsoDate(current);
    if (nextIso > today) {
      return;
    }

    await setDisplayedDate(nextIso);
  }

  function start() {
    logApp("info", "home.lifecycle", "Mounting the home page.");
    void initializeHomePage();

    if (browser) {
      rustBackgroundJobTimer = window.setInterval(() => {
        void runRustBackgroundJob();
      }, rustBackgroundJobIntervalMs);
    }

    void runRustBackgroundJob();
    void refreshHealthStats();
  }

  function stop() {
    logApp("info", "home.lifecycle", "Unmounting the home page.");
    clearRustBackgroundJobTimer();
    stopSelectedWhoopTracking();
  }

  function openDeviceManagement() {
    activeScreen.set("device");
  }

  function navigateToScreen(screen: ActiveScreen) {
    activeScreen.set(screen);
  }

  function closeDeviceManagement() {
    activeScreen.set("main");
  }

  function openDeviceChooser() {
    startupError.set("");
    selectedWhoopError.set("");
    activeScreen.set("scan");
  }

  function openHealthPage() {
    activeScreen.set("health");
  }

  function openMainPage() {
    activeScreen.set("main");
  }

  function openMorePage() {
    activeScreen.set("more");
  }

  function openAddActivity() {
    activeScreen.set("add-activity");
  }

  function openStartActivity() {
    activeScreen.set("start-activity");
  }

  function closeActivityFlow() {
    activeScreen.set("main");
  }

  function openHealthMonitor() {
    activeScreen.set("health-monitor");
  }

  function openStressMonitor() {
    activeScreen.set("stress-monitor");
  }

  function closeHealthMonitor() {
    activeScreen.set("health");
  }

  function closeStressMonitor() {
    activeScreen.set("health");
  }

  function handleDeviceConnected() {
    startupError.set("");
    selectedWhoopError.set("");
    activeScreen.set("main");
  }

  return {
    selectedWhoop,
    initializing,
    startupError,
    selectedWhoopError,
    clearing,
    reconnecting,
    rebooting,
    erasing,
    activeScreen,
    hasSelectedWhoopBefore,
    latestSyncLabel,
    dailyInfo,
    latestDailyStats,
    last7DayDailyStatsAverage,
    selectedDate,
    canSelectPreviousDate,
    isSelectedDateToday,
    showPrimaryNav,
    start,
    stop,
    reconnectSavedWhoop,
    unselectWhoop,
    rebootSelectedWhoop,
    eraseSelectedWhoopData,
    openDeviceManagement,
    navigateToScreen,
    closeDeviceManagement,
    openDeviceChooser,
    openHealthPage,
    openMainPage,
    openMorePage,
    openAddActivity,
    openStartActivity,
    closeActivityFlow,
    openHealthMonitor,
    openStressMonitor,
    selectPreviousDate,
    selectNextDate,
    refreshSelectedDate,
    refreshHealthStats,
    closeHealthMonitor,
    closeStressMonitor,
    handleDeviceConnected,
  };
}
