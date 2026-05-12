# OpenWhoop App

OpenWhoop App is a SvelteKit + Tauri 2 mobile client for connecting to a WHOOP device over Bluetooth, syncing data into a local SQLite database, and viewing daily health and activity information on Android and iOS.

It is built on top of the `openwhoop` Rust libraries and uses Tauri commands as the bridge between the Svelte UI and the BLE/database runtime.

## Features

- Bluetooth permission gating before app startup
- Scan for nearby WHOOP devices
- Save a selected WHOOP and reconnect on later launches
- Background sync of saved-device data into SQLite
- Daily views for sleep, strain, activities, and stress
- Heart-rate and stress live monitoring screens
- Activity creation, update, and deletion
- Database export and import/sync flows
- Android build, signing, install, and uninstall helper scripts
- Mobile-first Tauri runtime intended for Android and iOS

## Stack

- Frontend: SvelteKit, Svelte 5, TypeScript, Vite
- Mobile shell: Tauri 2
- Backend/runtime: Rust
- BLE: `tauri-plugin-blec`, `btleplug`, `openwhoop`
- Persistence: SQLite via `openwhoop::db::DatabaseHandler`

## Project Layout

```text
src/                    Svelte app, screens, stores, and Tauri API wrappers
src/lib/api/            Typed frontend wrappers around Tauri commands
src/lib/screens/        App screens for device, health, stress, and activity flows
src/lib/stores/         UI state and app orchestration
src-tauri/src/          Rust runtime, command handlers, app state, config
scripts/                Android dev/build/install/signing helper scripts
```

## Requirements

### General

- Node.js
- `pnpm`
- Rust toolchain

### Android development

- Android SDK
- Java `keytool`
- `adb`
- A configured Android emulator or physical device

### iOS development

- Xcode
- iOS Simulator or a physical iPhone
- Tauri 2 iOS toolchain requirements

## Install

```bash
pnpm install
```

## Development

### Frontend only

```bash
pnpm dev
```

This starts the SvelteKit/Vite app on `http://localhost:1420`.

### Tauri mobile app

```bash
pnpm tauri dev
```

Tauri is configured to start the frontend automatically with `pnpm dev`.

This repository is intended for mobile targets. The current helper scripts in `scripts/` are Android-specific.

## Android Workflow

### 1. Generate a local signing key

```bash
pnpm android:keygen
```

This creates:

- `./release.keystore`
- `./.android-signing.env`

Both are local-only and ignored by git. The signing env file stores passwords in plain text for local builds.

### 2. Run Android dev

```bash
pnpm android:dev
```

This loads signing values from `./.android-signing.env` and runs `tauri android dev`.

### 3. Build APKs

```bash
pnpm android:build:apk
```

This produces:

- `./debug/openwhoop-app-debug.apk`
- `./release/openwhoop-app-release.apk`

### 4. Install/uninstall helpers

```bash
pnpm android:install:debug
pnpm android:install:release
pnpm android:uninstall
pnpm android:uninstall-keep-data
```

The install script retries automatically after a full uninstall if `adb` reports a signature mismatch.

## iOS Workflow

There are no dedicated iOS helper scripts in this repository yet.

Use Tauri's iOS commands directly once the Apple/iOS toolchain is installed:

```bash
pnpm tauri ios dev
pnpm tauri ios build
```

## Available Scripts

```bash
pnpm dev
pnpm build
pnpm preview
pnpm check
pnpm check:watch
pnpm ios:dev
pnpm ios:build
pnpm android:dev
pnpm android:keygen
pnpm android:build:apk
pnpm android:uninstall
pnpm android:uninstall-keep-data
pnpm android:install:release
pnpm android:install:debug
```

## App Behavior

On launch, the app:

1. Checks Bluetooth permissions.
2. Loads the saved WHOOP selection state.
3. If a device was previously selected, restores runtime state and tries to reconnect.
4. Starts using local app data for persistence and logs on the mobile device.

The Rust backend exposes Tauri commands for:

- BLE permission checks
- WHOOP scanning and selection
- Saved-device reconnect
- Heart-rate and stress streaming
- Daily info and latest reading queries
- Activity CRUD
- Database export/import
- Frontend log ingestion

## Local Data

The app stores its runtime files in the Tauri app data directory. Important files include:

- `whoop-store.json`: saved WHOOP selection
- `db.sqlite`: synced WHOOP data
- `openwhoop-app.log`: application log file

The Rust config currently rotates logs at `512 KB` and uses a `60s` background sync interval with a `15s` retry interval.

## Notes

- This app is intended for Android and iOS, not desktop distribution.
- Android builds require signing to be configured before running the helper scripts.
- The app depends on the `openwhoop`, `openwhoop-codec`, and `openwhoop-entities` crates from the `feat/app-support` branch of the upstream repository.
- The generated `build/`, `debug/`, `release/`, `*.sqlite`, keystore, and signing env files are intentionally ignored by git.

## License

MIT
