import { isTauri } from "@tauri-apps/api/core";
import { writable } from "svelte/store";
import { checkBlePermissions } from "$lib/api";

function toErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

export function createPagePermissionsState() {
  const hasPermissions = writable(false);
  const permissionsChecked = writable(false);
  const permissionError = writable("");

  async function checkPermissions(ask: boolean) {
    permissionError.set("");

    if (!isTauri()) {
      hasPermissions.set(true);
      permissionsChecked.set(true);
      return;
    }

    try {
      hasPermissions.set(await checkBlePermissions(ask));
    } catch (reason) {
      hasPermissions.set(false);
      permissionError.set(toErrorMessage(reason));
    } finally {
      permissionsChecked.set(true);
    }
  }

  return {
    hasPermissions,
    permissionsChecked,
    permissionError,
    checkPermissions,
  };
}
