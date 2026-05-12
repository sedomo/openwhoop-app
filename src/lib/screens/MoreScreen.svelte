<script lang="ts">
  import { onMount } from "svelte";
  import { Button, Switch } from "bits-ui";
  import {
    exportDatabaseCopy,
    getDebugPackets,
    getImportSyncStatus,
    importDatabaseSync,
    setDebugPackets,
  } from "$lib/api";
  import type { ImportSyncStatus } from "$lib/api/interfaces";

  let exporting = false;
  let debugPackets = false;
  let savingDebugPackets = false;
  let successVisible = false;
  let successMessage = "";
  let successTimeout: ReturnType<typeof setTimeout> | null = null;
  let errorVisible = false;
  let errorMessage = "";
  let errorTimeout: ReturnType<typeof setTimeout> | null = null;
  let importStatus: ImportSyncStatus | null = null;
  let importStatusTimer: ReturnType<typeof setInterval> | null = null;
  let previousImportRunning = false;
  let lastShownImportError = "";

  function toErrorMessage(reason: unknown) {
    if (reason instanceof Error) {
      return reason.message;
    }

    if (
      typeof reason === "object" &&
      reason !== null &&
      "message" in reason &&
      typeof reason.message === "string"
    ) {
      return reason.message;
    }

    return String(reason);
  }

  async function refreshImportStatus() {
    try {
      const nextStatus = await getImportSyncStatus();
      const completedNow =
        previousImportRunning &&
        !nextStatus.running &&
        nextStatus.stage === "Import complete";

      previousImportRunning = nextStatus.running;
      importStatus = nextStatus;

      if (importStatus.lastError && importStatus.lastError !== lastShownImportError) {
        lastShownImportError = importStatus.lastError;
        showError(importStatus.lastError);
      } else if (!importStatus.lastError) {
        lastShownImportError = "";
      }

      if (completedNow) {
        showSuccess("Database imported");
      }
    } catch (reason) {
      showError(toErrorMessage(reason));
    }
  }

  onMount(() => {
    void loadDebugPackets();
    void refreshImportStatus();
    importStatusTimer = setInterval(() => {
      void refreshImportStatus();
    }, 1000);

    return () => {
      if (importStatusTimer) {
        clearInterval(importStatusTimer);
      }

      if (successTimeout) {
        clearTimeout(successTimeout);
      }

      if (errorTimeout) {
        clearTimeout(errorTimeout);
      }
    };
  });

  async function loadDebugPackets() {
    try {
      debugPackets = await getDebugPackets();
    } catch (reason) {
      showError(toErrorMessage(reason));
    }
  }

  function showSuccess(message: string) {
    successMessage = message;
    successVisible = true;

    if (successTimeout) {
      clearTimeout(successTimeout);
    }

    successTimeout = setTimeout(() => {
      successVisible = false;
      successTimeout = null;
    }, 2000);
  }

  function showError(message: string) {
    errorMessage = message;
    errorVisible = true;

    if (errorTimeout) {
      clearTimeout(errorTimeout);
    }

    errorTimeout = setTimeout(() => {
      errorVisible = false;
      errorTimeout = null;
    }, 3000);
  }

  async function handleExport() {
    exporting = true;

    try {
      const path = await exportDatabaseCopy();

      if (!path) {
        return;
      }

      showSuccess("Database exported");
    } catch (reason) {
      showError(toErrorMessage(reason));
    } finally {
      exporting = false;
    }
  }

  async function handleImport() {
    try {
      const imported = await importDatabaseSync();

      if (!imported) {
        return;
      }
      await refreshImportStatus();
    } catch (reason) {
      showError(toErrorMessage(reason));
    }
  }

  async function handleDebugPacketsChange(nextValue: boolean) {
    debugPackets = nextValue;
    savingDebugPackets = true;

    try {
      debugPackets = await setDebugPackets(nextValue);
    } catch (reason) {
      debugPackets = !nextValue;
      showError(toErrorMessage(reason));
    } finally {
      savingDebugPackets = false;
    }
  }

  function getImportButtonLabel(status: ImportSyncStatus | null) {
    if (!status) {
      return "Import Database";
    }

    if (status.running) {
      return status.stage || "Importing database...";
    }

    if (status.stage === "Import complete") {
      return "Import complete";
    }

    return "Import Database";
  }
</script>

<section class="screen-shell more-screen">
  <div class="screen-stack">
    {#if successVisible}
      <p class="alert more-screen__toast">{successMessage}</p>
    {/if}

    {#if errorVisible}
      <p class="alert alert--error more-screen__toast more-screen__toast--error">{errorMessage}</p>
    {/if}

    <div class="panel stack-sm">
      <div class="stack-xs">
        <p class="eyebrow">More</p>
        <h1>Data Tools</h1>
        <p class="muted">
          Export the local SQLite database to a file path you choose.
        </p>
      </div>

      <div class="more-screen__toggle-row">
        <div class="stack-xs">
          <strong>Debug packets</strong>
          <p class="muted">Log WHOOP transport packet debugging.</p>
        </div>

        <Switch.Root
          class="ui-switch"
          checked={debugPackets}
          disabled={savingDebugPackets}
          onCheckedChange={(checked) => void handleDebugPacketsChange(checked)}
        >
          <Switch.Thumb class="ui-switch-thumb" />
        </Switch.Root>
      </div>

      <Button.Root
        class="ui-button ui-button--secondary ui-button--full"
        type="button"
        disabled={exporting}
        onclick={() => void handleExport()}
      >
        {exporting ? "Exporting database..." : "Export Database"}
      </Button.Root>

      <Button.Root
        class="ui-button ui-button--full"
        type="button"
        disabled={Boolean(importStatus?.running) || exporting}
        onclick={() => void handleImport()}
      >
        {getImportButtonLabel(importStatus)}
      </Button.Root>
    </div>
  </div>
</section>

<style>
  .more-screen {
    position: relative;
  }

  .more-screen__toast {
    position: absolute;
    top: calc(env(safe-area-inset-top, 0px) + 0.35rem);
    left: 1rem;
    right: 1rem;
    z-index: 10;
    margin: 0;
    pointer-events: none;
    border-color: rgba(99, 208, 138, 0.42);
    background: #163324;
    color: #d8ffe5;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  }

  .more-screen__toast--error {
    border-color: rgba(255, 127, 137, 0.36);
    background: #4a1820;
    color: #ffd7da;
  }

  .more-screen__toggle-row {
    min-height: 4.9rem;
    width: 100%;
    border: 1px solid var(--border-strong);
    border-radius: 1.4rem;
    padding: 0.9rem 1.1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    background: rgba(255, 255, 255, 0.03);
  }
</style>
