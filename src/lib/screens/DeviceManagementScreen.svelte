<script lang="ts">
  import { Accordion, Button, Progress, Separator, Switch, Tabs } from "bits-ui";
  import { appStore } from "$lib/stores/appStore";
  import type { SelectedWhoop } from "$lib/stores/selectedWhoop";
  import {
    batteryDetail,
    batteryPercentLabel,
    connectedDeviceLabel,
    connectionLabel,
    connectionTone,
    type DeviceTab,
    deviceIdLabel,
    generationLabel,
    hasSelectedWhoop,
    isDeviceManagementBusy,
    lastSyncLabel,
    statusCopy,
    statusHeadline,
  } from "$lib/stores/deviceManagement";

  export let whoop: SelectedWhoop;
  export let latestSyncLabel = "--:--";
  export let error = "";
  export let clearing = false;
  export let reconnecting = false;
  export let rebooting = false;
  export let erasing = false;
  export let showReconnect = false;
  export let onReconnect: () => Promise<void> | void = () => undefined;
  export let onChooseAnother: () => Promise<void> | void = () => undefined;
  export let onReboot: () => Promise<void> | void = () => undefined;
  export let onErase: () => Promise<void> | void = () => undefined;
  export let onOpenScan: () => void = () => undefined;
  export let onBack: () => void = () => undefined;

  let busy = false;
  const activeTab = appStore.pages.deviceManagement.activeTab;
  const heartRateBroadcast = appStore.pages.deviceManagement.heartRateBroadcast;
  const localNotice = appStore.pages.deviceManagement.localNotice;

  $: appStore.pages.deviceManagement.configure({
    onReconnect,
    onChooseAnother,
    onReboot,
    onErase,
    onOpenScan,
  });

  $: appStore.pages.deviceManagement.syncBroadcastPreferenceFromStorage(whoop);
  $: appStore.pages.deviceManagement.persistBroadcastPreference();
  $: busy = isDeviceManagementBusy(reconnecting, clearing, rebooting, erasing);
  $: tone = connectionTone(whoop, reconnecting);
  $: toneBadgeClass =
    tone === "connected"
      ? "badge--connected"
      : tone === "syncing"
        ? "badge--syncing"
        : tone === "offline"
          ? "badge--offline"
          : "badge--subtle";
</script>

<section class="screen-shell" aria-labelledby="device-screen-title">
  <div class="screen-stack">
    <header class="screen-header screen-header--balanced">
      <Button.Root
        class="ui-button ui-button--ghost"
        type="button"
        aria-label="Close device settings"
        onclick={onBack}
      >
        Back
      </Button.Root>

      <div class="screen-header__center">
        <h1 id="device-screen-title">Device settings</h1>
        <p class="muted">Saved WHOOP management</p>
      </div>

      <Button.Root
        class="ui-button ui-button--ghost"
        type="button"
        aria-label="About this screen"
        onclick={appStore.pages.deviceManagement.openInfoNotice}
      >
        About
      </Button.Root>
    </header>

    <section class="panel stack-sm" aria-label="Connected device summary">
      <div class="split-row split-row--top">
        <div>
          <p class="eyebrow">Connected to</p>
          <h2>{connectedDeviceLabel(whoop)}</h2>
          <p class="muted mono">{deviceIdLabel(whoop)}</p>
        </div>

        <div class="summary-badge-column">
          <span class={`badge ${toneBadgeClass}`}>
            {connectionLabel(whoop, reconnecting)}
          </span>
          <span class="muted">
            Last sync {lastSyncLabel(whoop, latestSyncLabel)}
          </span>
        </div>
      </div>

      <Button.Root
        class="ui-button ui-button--secondary"
        type="button"
        onclick={appStore.pages.deviceManagement.openScanScreen}
        disabled={busy}
      >
        Change device
      </Button.Root>
    </section>

    {#if error}
      <p class="alert alert--error">{error}</p>
    {/if}

    {#if $localNotice}
      <p class="alert">{$localNotice}</p>
    {/if}

    <Tabs.Root
      class="stack-sm"
      value={$activeTab}
      onValueChange={(value) =>
        appStore.pages.deviceManagement.selectTab(value as DeviceTab)}
    >
      <Tabs.List class="tab-list" aria-label="Device settings sections">
        <Tabs.Trigger class="tab-trigger" value="status">Status</Tabs.Trigger>
        <Tabs.Trigger class="tab-trigger" value="advanced"
          >Advanced</Tabs.Trigger
        >
      </Tabs.List>

      <Tabs.Content value="status" class="stack-sm" aria-label="Device status">
        <section class="panel stack-sm">
          <div class="split-row split-row--top">
            <div class="stack-xs">
              <p class="eyebrow">{connectionLabel(whoop, reconnecting)}</p>
              <h2>{statusHeadline(whoop, reconnecting)}</h2>
              <p class="muted">{statusCopy(whoop, reconnecting)}</p>
            </div>

            <div class="metric-card metric-card--compact">
              <span class="detail-label">Battery</span>
              <strong>{batteryPercentLabel()}</strong>
              <p class="muted">{batteryDetail(whoop)}</p>
            </div>
          </div>

          <Progress.Root
            class="ui-progress"
            value={0}
            max={100}
            aria-label="Battery unavailable"
          >
            <span class="ui-progress-indicator" style="width: 0%"></span>
          </Progress.Root>

          {#if showReconnect && hasSelectedWhoop(whoop)}
            <Button.Root
              class="ui-button ui-button--secondary"
              type="button"
              onclick={() =>
                void appStore.pages.deviceManagement.reconnectWhoop()}
              disabled={busy}
            >
              {reconnecting ? "Reconnecting..." : "Reconnect device"}
            </Button.Root>
          {:else if !hasSelectedWhoop(whoop)}
            <Button.Root
              class="ui-button ui-button--secondary"
              type="button"
              onclick={appStore.pages.deviceManagement.openScanScreen}
              disabled={busy}
            >
              Pair a device
            </Button.Root>
          {/if}
        </section>

        <section class="panel stack-sm">
          <div class="detail-grid">
            <article class="detail-card">
              <span class="detail-label">Device ID</span>
              <strong>{deviceIdLabel(whoop)}</strong>
            </article>

            <article class="detail-card">
              <span class="detail-label">Generation</span>
              <strong>{generationLabel(whoop)}</strong>
            </article>
          </div>
        </section>

        <section class="panel panel-row" aria-label="Broadcast heart rate">
          <div class="stack-xs">
            <strong>Broadcast Heart Rate</strong>
            <p class="muted">Saved locally for this device</p>
          </div>

          <Switch.Root
            class="ui-switch"
            checked={$heartRateBroadcast}
            aria-label="Toggle heart rate broadcasting"
            onCheckedChange={() =>
              appStore.pages.deviceManagement.toggleHeartRateBroadcast(whoop)}
          >
            <Switch.Thumb class="ui-switch-thumb" />
          </Switch.Root>
        </section>
      </Tabs.Content>

      <Tabs.Content
        value="advanced"
        class="stack-sm"
        aria-label="Advanced settings"
      >
        <section class="panel stack-sm">
          <div class="detail-grid">
            <article class="detail-card">
              <span class="detail-label">Device ID</span>
              <strong>{deviceIdLabel(whoop)}</strong>
            </article>

            <article class="detail-card">
              <span class="detail-label">Generation</span>
              <strong>{generationLabel(whoop)}</strong>
            </article>
          </div>

          <Separator.Root class="ui-separator" />

          <Accordion.Root class="accordion" type="single">
            <Accordion.Item class="accordion-item" value="pair">
              <Accordion.Header class="accordion-header">
                <Accordion.Trigger class="accordion-trigger">
                  <span>Pair a device</span>
                  <span class="accordion-chevron" aria-hidden="true">⌄</span>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content class="accordion-content">
                <p class="muted">
                  Open the scanner and replace the currently saved WHOOP when
                  you select a new one.
                </p>
                <Button.Root
                  class="ui-button ui-button--secondary"
                  type="button"
                  onclick={appStore.pages.deviceManagement.openScanScreen}
                  disabled={busy}
                >
                  Pair a device
                </Button.Root>
              </Accordion.Content>
            </Accordion.Item>

            <Accordion.Item class="accordion-item" value="reconnect">
              <Accordion.Header class="accordion-header">
                <Accordion.Trigger class="accordion-trigger">
                  <span>Reconnect device</span>
                  <span class="accordion-chevron" aria-hidden="true">⌄</span>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content class="accordion-content">
                <p class="muted">
                  Scan for and reconnect to the saved WHOOP again.
                </p>
                <Button.Root
                  class="ui-button ui-button--secondary"
                  type="button"
                  onclick={() =>
                    void appStore.pages.deviceManagement.reconnectWhoop()}
                  disabled={!hasSelectedWhoop(whoop) || busy}
                >
                  {reconnecting ? "Reconnecting..." : "Reconnect device"}
                </Button.Root>
              </Accordion.Content>
            </Accordion.Item>

            <Accordion.Item class="accordion-item" value="unpair">
              <Accordion.Header class="accordion-header">
                <Accordion.Trigger class="accordion-trigger">
                  <span>Unpair device</span>
                  <span class="accordion-chevron" aria-hidden="true">⌄</span>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content class="accordion-content">
                <p class="muted">
                  Remove the saved WHOOP from OpenWhoop and clear the Bluetooth
                  target.
                </p>
                <Button.Root
                  class="ui-button ui-button--danger"
                  type="button"
                  onclick={() =>
                    void appStore.pages.deviceManagement.chooseAnotherWhoop()}
                  disabled={!hasSelectedWhoop(whoop) || busy}
                >
                  {clearing ? "Unpairing..." : "Unpair device"}
                </Button.Root>
              </Accordion.Content>
            </Accordion.Item>

            <Accordion.Item class="accordion-item" value="erase">
              <Accordion.Header class="accordion-header">
                <Accordion.Trigger class="accordion-trigger">
                  <span>Erase device data</span>
                  <span class="accordion-chevron" aria-hidden="true">⌄</span>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content class="accordion-content">
                <p class="muted">
                  Trim all stored history data from the WHOOP and keep the saved
                  pairing.
                </p>
                <Button.Root
                  class="ui-button ui-button--danger"
                  type="button"
                  onclick={() =>
                    void appStore.pages.deviceManagement.eraseDeviceData()}
                  disabled={!hasSelectedWhoop(whoop) || busy}
                >
                  {erasing ? "Erasing..." : "Erase device data"}
                </Button.Root>
              </Accordion.Content>
            </Accordion.Item>

            <Accordion.Item class="accordion-item" value="reboot">
              <Accordion.Header class="accordion-header">
                <Accordion.Trigger class="accordion-trigger">
                  <span>Reboot device</span>
                  <span class="accordion-chevron" aria-hidden="true">⌄</span>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content class="accordion-content">
                <p class="muted">
                  Restart the WHOOP and let OpenWhoop reconnect in the
                  background.
                </p>
                <Button.Root
                  class="ui-button ui-button--secondary"
                  type="button"
                  onclick={() =>
                    void appStore.pages.deviceManagement.rebootDevice()}
                  disabled={!hasSelectedWhoop(whoop) || busy}
                >
                  {rebooting ? "Rebooting..." : "Reboot device"}
                </Button.Root>
              </Accordion.Content>
            </Accordion.Item>

            <Accordion.Item class="accordion-item" value="firmware">
              <Accordion.Header class="accordion-header">
                <Accordion.Trigger class="accordion-trigger">
                  <span>Firmware check</span>
                  <span class="badge badge--subtle">Unavailable</span>
                </Accordion.Trigger>
              </Accordion.Header>

              <Accordion.Content class="accordion-content">
                <p class="muted">
                  The Tauri backend does not expose a firmware query yet.
                </p>
                <Button.Root
                  class="ui-button ui-button--ghost"
                  type="button"
                  disabled
                >
                  Firmware check unavailable
                </Button.Root>
              </Accordion.Content>
            </Accordion.Item>
          </Accordion.Root>
        </section>
      </Tabs.Content>
    </Tabs.Root>
  </div>
</section>
