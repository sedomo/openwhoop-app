import { writeAppLog } from "$lib/api";
import type { AppLogLevel } from "$lib/api/interfaces";
import { isTauri } from "@tauri-apps/api/core";


function consoleMethod(level: AppLogLevel) {
  switch (level) {
    case "debug":
      return console.debug.bind(console);
    case "info":
      return console.info.bind(console);
    case "warn":
      return console.warn.bind(console);
    case "error":
      return console.error.bind(console);
  }
}

function formatDetails(details: unknown) {
  if (details === undefined || details === null) {
    return "";
  }

  if (details instanceof Error) {
    return ` ${details.message}`;
  }

  if (typeof details === "string") {
    return ` ${details}`;
  }

  try {
    return ` ${JSON.stringify(details)}`;
  } catch {
    return ` ${String(details)}`;
  }
}

export function logApp(level: AppLogLevel, scope: string, message: string, details?: unknown) {
  let renderedMessage = `${message}${formatDetails(details)}`;
  let prefix = `[ts:${scope}] ${renderedMessage}`;

  consoleMethod(level)(prefix);

  if (!isTauri()) {
    return;
  }
  writeAppLog(level, scope, renderedMessage)
}
