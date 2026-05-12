import { browser } from "$app/environment";
import { get, writable } from "svelte/store";
import type { SelectedWhoop } from "$lib/stores/selectedWhoop";

export type DeviceTab = "status" | "advanced";
export type ConnectionTone = "idle" | "connected" | "syncing" | "offline";

interface CreateDeviceManagementScreenStateOptions {
  onReconnect: () => Promise<void> | void;
  onChooseAnother: () => Promise<void> | void;
  onReboot: () => Promise<void> | void;
  onErase: () => Promise<void> | void;
  onOpenScan: () => void;
}

const noopAsync = async () => undefined;
const noop = () => undefined;

function formatAddress(address: string) {
  return address.toUpperCase();
}

export function hasSelectedWhoop(whoop: SelectedWhoop) {
  return whoop.address.trim().length > 0;
}

export function connectedDeviceLabel(whoop: SelectedWhoop) {
  return hasSelectedWhoop(whoop) ? whoop.name : "No WHOOP selected";
}

export function connectionLabel(
  whoop: SelectedWhoop,
  reconnecting: boolean,
) {
  if (!hasSelectedWhoop(whoop)) {
    return "Not Paired";
  }

  if (whoop.connected) {
    return "Connected";
  }

  if (reconnecting) {
    return "Syncing";
  }

  return "Disconnected";
}

export function lastSyncLabel(whoop: SelectedWhoop, latestSyncLabel: string) {
  return hasSelectedWhoop(whoop) ? latestSyncLabel : "--:--";
}

export function statusHeadline(
  whoop: SelectedWhoop,
  reconnecting: boolean,
) {
  if (!hasSelectedWhoop(whoop)) {
    return "Pair a WHOOP";
  }

  if (whoop.connected) {
    return "Device ready";
  }

  if (reconnecting) {
    return "Trying to reconnect";
  }

  return "Saved device offline";
}

export function statusCopy(whoop: SelectedWhoop, reconnecting: boolean) {
  if (!hasSelectedWhoop(whoop)) {
    return "Open the scanner to pair your WHOOP and return here for device settings.";
  }

  if (whoop.connected) {
    return "Your saved WHOOP is connected. Battery and firmware values stay hidden here until the Tauri backend exposes real device data.";
  }

  if (reconnecting) {
    return "Stay on this screen while OpenWhoop searches for the saved WHOOP again.";
  }

  return "This WHOOP is still saved locally. Reconnect it now or pair another device.";
}

export function deviceIdLabel(whoop: SelectedWhoop) {
  return hasSelectedWhoop(whoop) ? formatAddress(whoop.address) : "Not paired";
}

export function generationLabel(whoop: SelectedWhoop) {
  return hasSelectedWhoop(whoop) ? whoop.generation : "Not paired";
}

export function batteryPercentLabel() {
  return "--%";
}

export function batteryDetail(whoop: SelectedWhoop) {
  return hasSelectedWhoop(whoop) ? "Battery unavailable" : "Not paired";
}

export function connectionTone(
  whoop: SelectedWhoop,
  reconnecting: boolean,
): ConnectionTone {
  if (!hasSelectedWhoop(whoop)) {
    return "idle";
  }

  if (whoop.connected) {
    return "connected";
  }

  if (reconnecting) {
    return "syncing";
  }

  return "offline";
}

export function isDeviceManagementBusy(
  reconnecting: boolean,
  clearing: boolean,
  rebooting: boolean,
  erasing: boolean,
) {
  return reconnecting || clearing || rebooting || erasing;
}

export function createDeviceManagementScreenState() {
  const activeTab = writable<DeviceTab>("status");
  const heartRateBroadcast = writable(false);
  const localNotice = writable("");
  let options: CreateDeviceManagementScreenStateOptions = {
    onReconnect: noopAsync,
    onChooseAnother: noopAsync,
    onReboot: noopAsync,
    onErase: noopAsync,
    onOpenScan: noop,
  };

  let loadedBroadcastKey = "";
  let broadcastPreferenceReady = false;

  function configure(nextOptions: CreateDeviceManagementScreenStateOptions) {
    options = nextOptions;
  }

  function clearNotice() {
    localNotice.set("");
  }

  function openInfoNotice() {
    localNotice.set(
      "Pair, reconnect, unpair, reboot, and erase are active here. Broadcast heart rate is saved locally per device. Battery and firmware values stay hidden until the Tauri backend exposes real device data.",
    );
  }

  function openScanScreen() {
    clearNotice();
    options.onOpenScan();
  }

  async function chooseAnotherWhoop() {
    clearNotice();
    await options.onChooseAnother();
  }

  async function reconnectWhoop() {
    clearNotice();
    await options.onReconnect();
  }

  async function rebootDevice() {
    clearNotice();
    await options.onReboot();
  }

  async function eraseDeviceData() {
    clearNotice();
    await options.onErase();
  }

  function selectTab(tab: DeviceTab) {
    activeTab.set(tab);
  }

  function broadcastPreferenceKey(whoop: SelectedWhoop) {
    const deviceKey = hasSelectedWhoop(whoop)
      ? formatAddress(whoop.address)
      : "UNPAIRED";
    return `openwhoop:heart-rate-broadcast:${deviceKey}`;
  }

  function syncBroadcastPreferenceFromStorage(whoop: SelectedWhoop) {
    if (!browser) {
      return;
    }

    const nextKey = broadcastPreferenceKey(whoop);

    if (broadcastPreferenceReady && loadedBroadcastKey === nextKey) {
      return;
    }

    loadedBroadcastKey = nextKey;
    heartRateBroadcast.set(window.localStorage.getItem(nextKey) === "true");
    broadcastPreferenceReady = true;
  }

  function persistBroadcastPreference() {
    if (!browser || !broadcastPreferenceReady || !loadedBroadcastKey) {
      return;
    }

    window.localStorage.setItem(
      loadedBroadcastKey,
      get(heartRateBroadcast) ? "true" : "false",
    );
  }

  function toggleHeartRateBroadcast(whoop: SelectedWhoop) {
    clearNotice();
    syncBroadcastPreferenceFromStorage(whoop);
    heartRateBroadcast.update((value) => !value);
    persistBroadcastPreference();
  }

  return {
    activeTab,
    heartRateBroadcast,
    localNotice,
    configure,
    openInfoNotice,
    openScanScreen,
    chooseAnotherWhoop,
    reconnectWhoop,
    rebootDevice,
    eraseDeviceData,
    selectTab,
    syncBroadcastPreferenceFromStorage,
    persistBroadcastPreference,
    toggleHeartRateBroadcast,
  };
}
