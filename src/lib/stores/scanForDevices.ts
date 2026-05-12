import { isTauri } from "@tauri-apps/api/core";
import { get, writable } from "svelte/store";
import { connectToWhoop, scanForWhoops } from "$lib/api";
import type { WhoopScanResult } from "$lib/api/interfaces";
import { setSelectedWhoop } from "$lib/stores/selectedWhoop";
import { logApp } from "$lib/utils/logging";

export type ScanMode = "initial" | "returning";

interface CreateScanForDevicesStateOptions {
  initialError: string;
  mode: ScanMode;
  onConnected?: (() => void) | undefined;
}

const placeholderRows = [0, 1, 2];
const scanRetryDelayMs = 250;

function toErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function eyebrowCopy(mode: ScanMode) {
  return mode === "returning" ? "CHANGE DEVICE" : "CHOOSE A DEVICE";
}

export function titleCopy(mode: ScanMode) {
  return mode === "returning" ? "Choose another WHOOP" : "Choose a device";
}

export function subtitleCopy(mode: ScanMode) {
  return mode === "returning"
    ? "Your previous WHOOP is no longer active. Pick a new device when you want to switch."
    : "Confirm the serial number on the side or top of the device.";
}

export function formatDeviceName(name: string) {
  const trimmedName = name.trim();
  return trimmedName ? trimmedName.toUpperCase() : "UNNAMED WHOOP";
}

function initialStatusCopy(mode: ScanMode) {
  return mode === "returning"
    ? "Scanning for a replacement WHOOP until you select one..."
    : "Scanning for nearby WHOOP devices until you select one...";
}

export function rowSignalLabel(
  device: WhoopScanResult,
  selectingAddress: string,
) {
  if (selectingAddress === device.address) {
    return "Saving";
  }

  return device.rssi === null ? "Signal unavailable" : `${device.rssi} dBm`;
}

const defaultOptions: CreateScanForDevicesStateOptions = {
  initialError: "",
  mode: "initial",
  onConnected: undefined,
};

export function createScanForDevicesState() {
  const devices = writable<WhoopScanResult[]>([]);
  const status = writable("Ready to scan for WHOOP devices.");
  const error = writable("");
  const scanning = writable(false);
  const selectingAddress = writable("");
  const selectedAddress = writable("");
  let options = { ...defaultOptions };

  let mounted = false;
  let lastLoggedDeviceCount = -1;

  function configure(nextOptions: CreateScanForDevicesStateOptions) {
    options = {
      ...defaultOptions,
      ...nextOptions,
    };
  }

  async function scanUntilSelected() {
    if (!isTauri() || get(scanning) || get(selectedAddress)) {
      return;
    }

    logApp("info", "scan.lifecycle", "Starting WHOOP scan loop.", {
      mode: options.mode,
    });
    scanning.set(true);
    status.set(initialStatusCopy(options.mode));

    while (mounted && !get(selectedAddress)) {
      try {
        const result = await scanForWhoops();

        if (!mounted || get(selectedAddress)) {
          break;
        }

        devices.set(result);
        if (result.length !== lastLoggedDeviceCount) {
          lastLoggedDeviceCount = result.length;
          logApp("info", "scan.results", "WHOOP scan result count changed.", {
            count: result.length,
          });
        }
        status.set(
          result.length > 0
            ? `Found ${result.length} WHOOP device${result.length === 1 ? "" : "s"}. Select the serial number that matches your strap.`
            : "No WHOOP devices found yet. Keeping the scan active...",
        );
        error.set("");
      } catch (reason) {
        if (!mounted || get(selectedAddress)) {
          break;
        }

        logApp(
          "warn",
          "scan.results",
          "WHOOP scan failed and will retry.",
          reason,
        );
        error.set(toErrorMessage(reason));
        status.set("WHOOP scan failed. Retrying automatically...");
      }

      if (!mounted || get(selectedAddress)) {
        break;
      }

      await sleep(scanRetryDelayMs);
    }

    scanning.set(false);
    logApp("info", "scan.lifecycle", "WHOOP scan loop ended.", {
      selectedAddress: get(selectedAddress),
    });
  }

  async function selectDevice(device: WhoopScanResult) {
    if (!isTauri() || get(selectingAddress)) {
      return;
    }

    logApp("info", "scan.select", "Connecting to the selected WHOOP.", {
      address: device.address,
      generation: device.generation,
      name: device.name,
    });
    selectingAddress.set(device.address);
    error.set("");

    try {
      const address = await connectToWhoop(device.address);
      selectedAddress.set(address);
      setSelectedWhoop({
        address,
        name: device.name,
        generation: device.generation,
        rssi: device.rssi,
      });
      status.set(
        `Connected ${formatDeviceName(device.name)} and saved its MAC in the Tauri app.`,
      );
      logApp("info", "scan.select", "WHOOP connected and saved.", {
        address,
      });
      options.onConnected?.();
    } catch (reason) {
      logApp(
        "error",
        "scan.select",
        "Unable to connect to the selected WHOOP.",
        reason,
      );
      error.set(toErrorMessage(reason));
      status.set("Unable to connect to the selected WHOOP and save its MAC.");
    } finally {
      selectingAddress.set("");
      scanning.set(false);
    }
  }

  function start() {
    mounted = true;
    logApp("info", "scan.lifecycle", "Mounting the WHOOP scan screen.", {
      mode: options.mode,
    });

    if (!isTauri()) {
      logApp(
        "warn",
        "scan.lifecycle",
        "Tauri APIs are unavailable for WHOOP scanning.",
      );
      status.set(
        "Bluetooth scanning is available only in the Tauri app. Run `pnpm tauri dev` to test it.",
      );
      return;
    }

    error.set(options.initialError);
    status.set(
      options.initialError
        ? "Unable to reconnect to the saved WHOOP. Scanning for nearby devices instead..."
        : initialStatusCopy(options.mode),
    );
    void scanUntilSelected();
  }

  function stop() {
    mounted = false;
    logApp("info", "scan.lifecycle", "Unmounting the WHOOP scan screen.");
  }

  return {
    devices,
    status,
    error,
    selectingAddress,
    selectedAddress,
    placeholderRows,
    configure,
    selectDevice,
    start,
    stop,
  };
}
