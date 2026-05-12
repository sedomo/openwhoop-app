<script lang="ts">
  import { Button } from "bits-ui";
  import { onMount } from "svelte";
  import HomePage from "$lib/screens/HomePage.svelte";
  import { appStore } from "$lib/stores/appStore";
  import "./page.css";

  const hasPermissions = appStore.permissions.hasPermissions;
  const permissionsChecked = appStore.permissions.permissionsChecked;
  const permissionError = appStore.permissions.permissionError;

  onMount(() => {
    void appStore.permissions.checkPermissions(false);
  });
</script>

<main
  class:app-shell={$hasPermissions}
  class:permission-shell={!$hasPermissions}
  class="container"
>
  {#if !$permissionsChecked}
    <section class="screen-shell screen-shell--center">
      <div class="panel screen-intro">
        <p class="eyebrow">Permissions</p>
        <h1>Checking bluetooth permissions</h1>
        <p class="muted">
          OpenWhoop needs Bluetooth access before it can scan for or reconnect
          to your WHOOP.
        </p>
      </div>
    </section>
  {:else if $hasPermissions}
    <HomePage />
  {:else}
    <section class="screen-shell screen-shell--center">
      <div class="panel screen-intro">
        <p class="eyebrow">Permissions</p>
        <h1>Bluetooth access required</h1>
        <p class="muted">
          Grant Bluetooth permissions to scan, pair, and reconnect to your
          WHOOP.
        </p>
        {#if $permissionError}
          <p class="alert alert--error">{$permissionError}</p>
        {/if}
        <Button.Root
          class="ui-button"
          type="button"
          onclick={() => void appStore.permissions.checkPermissions(true)}
        >
          Grant permissions
        </Button.Root>
      </div>
    </section>
  {/if}
</main>
