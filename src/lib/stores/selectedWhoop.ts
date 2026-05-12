import { writable } from "svelte/store";

export interface SelectedWhoop {
  address: string;
  name: string;
  generation: string;
  rssi: number | null;
  restoredFromState: boolean;
  connected: boolean;
}

const defaultWhoopName = "WHOOP";
const defaultWhoopGeneration = "Saved selection";

function normalizeText(value: string, fallback: string) {
  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : fallback;
}

export function createSelectedWhoopStore() {
  const current = writable<SelectedWhoop | null>(null);

  function set(
    whoop: Omit<SelectedWhoop, "restoredFromState" | "connected"> & {
      restoredFromState?: boolean;
      connected?: boolean;
    },
  ) {
    current.set({
      address: whoop.address.trim(),
      name: normalizeText(whoop.name, defaultWhoopName),
      generation: normalizeText(whoop.generation, defaultWhoopGeneration),
      rssi: whoop.rssi ?? null,
      restoredFromState: whoop.restoredFromState ?? false,
      connected: whoop.connected ?? true,
    });
  }

  function restore(address: string) {
    set({
      address,
      name: defaultWhoopName,
      generation: defaultWhoopGeneration,
      rssi: null,
      restoredFromState: true,
      connected: true,
    });
  }

  function clear() {
    current.set(null);
  }

  return {
    current,
    set,
    restore,
    clear,
  };
}

export const selectedWhoopStore = createSelectedWhoopStore();
export const selectedWhoop = selectedWhoopStore.current;
export const setSelectedWhoop = selectedWhoopStore.set;
export const restoreSelectedWhoop = selectedWhoopStore.restore;
export const clearSelectedWhoop = selectedWhoopStore.clear;
