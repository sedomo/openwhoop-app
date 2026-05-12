<script lang="ts">
  import { Button } from "bits-ui";
  import { onMount } from "svelte";
  import { appStore } from "$lib/stores/appStore";
  import {
    eyebrowCopy,
    formatDeviceName,
    rowSignalLabel,
    subtitleCopy,
    titleCopy,
  } from "$lib/stores/scanForDevices";

  export let initialError = "";
  export let mode: "initial" | "returning" = "initial";
  export let onConnected: (() => void) | undefined = undefined;
  export let onBack: (() => void) | undefined = undefined;
  const devices = appStore.pages.scan.devices;
  const status = appStore.pages.scan.status;
  const error = appStore.pages.scan.error;
  const selectingAddress = appStore.pages.scan.selectingAddress;
  const selectedAddress = appStore.pages.scan.selectedAddress;

  $: appStore.pages.scan.configure({
    initialError,
    mode,
    onConnected,
  });

  onMount(() => {
    appStore.pages.scan.start();
    return () => appStore.pages.scan.stop();
  });
</script>

<section class="screen-shell" aria-labelledby="scan-title">
  <div class="screen-stack screen-stack--wide">
    <header class="screen-header">
      <div>
        <p class="eyebrow">{eyebrowCopy(mode)}</p>
        <h1 id="scan-title">{titleCopy(mode)}</h1>
      </div>

      {#if mode === "returning" && onBack}
        <Button.Root
          class="ui-button ui-button--ghost"
          type="button"
          aria-label="Back to device screen"
          onclick={onBack}
        >
          Back
        </Button.Root>
      {/if}
    </header>

    <section class="panel stack-sm">
      <p class="muted">{subtitleCopy(mode)}</p>
      <p class="muted">{$status}</p>

      {#if $error}
        <p class="alert alert--error">{$error}</p>
      {/if}

      {#if $devices.length > 0}
        <div class="list-stack" aria-label="Discovered WHOOP devices">
          {#each $devices as device}
            <Button.Root
              class="panel panel-action device-row"
              type="button"
              onclick={() => void appStore.pages.scan.selectDevice(device)}
              disabled={Boolean($selectingAddress) || Boolean($selectedAddress)}
            >
              <div class="split-row split-row--top">
                <div>
                  <strong>{formatDeviceName(device.name)}</strong>
                  <p class="muted">{device.generation}</p>
                </div>

                <span class="badge badge--subtle">
                  {rowSignalLabel(
                    device,
                    $selectingAddress,
                  )}
                </span>
              </div>

              <p class="muted mono">{device.address.toUpperCase()}</p>
            </Button.Root>
          {/each}
        </div>
      {:else}
        <div class="list-stack" aria-hidden="true">
          {#each appStore.pages.scan.placeholderRows as row}
            <div
              class="panel skeleton-row"
              style={`animation-delay: ${row * 120}ms;`}
            ></div>
          {/each}
        </div>
      {/if}
    </section>
  </div>
</section>
