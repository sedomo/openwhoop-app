#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK_OUTPUT_DIR="$ROOT_DIR/src-tauri/gen/android/app/build/outputs/apk"
DEBUG_DIR="${DEBUG_DIR:-$ROOT_DIR/debug}"
RELEASE_DIR="${RELEASE_DIR:-$ROOT_DIR/release}"
APP_NAME="${APP_NAME:-openwhoop-app}"
SIGNING_ENV_FILE="$ROOT_DIR/.android-signing.env"

usage() {
  cat <<'EOF'
Build installable Android APKs and copy them to:
  ./debug/openwhoop-app-debug.apk
  ./release/openwhoop-app-release.apk

Usage:
  bash scripts/build-android-apks.sh [extra tauri android build args]

Examples:
  pnpm android:keygen
  bash scripts/build-android-apks.sh
  bash scripts/build-android-apks.sh --target aarch64

Release signing:
  The script loads signing config from ./.android-signing.env when present.
  You can also provide these environment variables directly:
    ANDROID_KEYSTORE_PATH
    ANDROID_KEYSTORE_PASSWORD
    ANDROID_KEY_ALIAS
    ANDROID_KEY_PASSWORD

Notes:
  - Debug builds use the debug Android application ID suffix from ./src-tauri/tauri.conf.json.
  - Debug APKs are already signed by the Android debug keystore.
  - This script fails before building if release signing is not configured.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

load_signing_env() {
  if [[ -f "$SIGNING_ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$SIGNING_ENV_FILE"
  fi
}

signing_setup_hint() {
  cat >&2 <<'EOF'
Android release signing is not configured.
Run `pnpm android:keygen` first, or export:
  ANDROID_KEYSTORE_PATH
  ANDROID_KEYSTORE_PASSWORD
  ANDROID_KEY_ALIAS
  ANDROID_KEY_PASSWORD
EOF
}

require_signing_value() {
  local var_name="$1"
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required signing value: $var_name" >&2
    signing_setup_hint
    exit 1
  fi
}

require_release_signing() {
  load_signing_env

  require_signing_value ANDROID_KEYSTORE_PATH
  require_signing_value ANDROID_KEYSTORE_PASSWORD
  require_signing_value ANDROID_KEY_ALIAS

  if [[ -z "${ANDROID_KEY_PASSWORD:-}" ]]; then
    ANDROID_KEY_PASSWORD="$ANDROID_KEYSTORE_PASSWORD"
    export ANDROID_KEY_PASSWORD
  fi

  if [[ ! -f "$ANDROID_KEYSTORE_PATH" ]]; then
    echo "Configured keystore file does not exist: $ANDROID_KEYSTORE_PATH" >&2
    signing_setup_hint
    exit 1
  fi
}

latest_file() {
  if [[ "$#" -lt 1 ]]; then
    return 1
  fi

  find "$@" -printf '%T@ %p\n' 2>/dev/null \
    | sort -n \
    | tail -1 \
    | cut -d' ' -f2-
}

latest_debug_apk() {
  latest_file \
    "$APK_OUTPUT_DIR" \
    -type f \
    -name '*.apk' \
    ! -name '*-unsigned.apk' \
    \( -path '*/debug/*' -o -name '*-debug.apk' \)
}

latest_signed_release_apk() {
  latest_file \
    "$APK_OUTPUT_DIR" \
    -type f \
    -name '*.apk' \
    ! -name '*-unsigned.apk' \
    \( -path '*/release/*' -o -name '*-release.apk' \)
}

latest_unsigned_release_apk() {
  latest_file \
    "$APK_OUTPUT_DIR" \
    -type f \
    -name '*-release-unsigned.apk'
}

resolve_android_sdk() {
  if [[ -n "${ANDROID_HOME:-}" && -d "${ANDROID_HOME:-}" ]]; then
    printf '%s\n' "$ANDROID_HOME"
    return 0
  fi

  if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT:-}" ]]; then
    printf '%s\n' "$ANDROID_SDK_ROOT"
    return 0
  fi

  if [[ -d "$HOME/Android/Sdk" ]]; then
    printf '%s\n' "$HOME/Android/Sdk"
    return 0
  fi

  return 1
}

resolve_build_tool() {
  local tool_name="$1"
  local sdk_dir candidate

  if command -v "$tool_name" >/dev/null 2>&1; then
    command -v "$tool_name"
    return 0
  fi

  sdk_dir="$(resolve_android_sdk)" || return 1
  candidate="$(
    find "$sdk_dir/build-tools" -maxdepth 2 -type f -name "$tool_name" 2>/dev/null \
      | sort -V \
      | tail -1
  )"

  if [[ -n "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return 0
  fi

  return 1
}

sign_release_apk() {
  local unsigned_apk="$1"
  local signed_apk="$2"
  local apksigner
  local apksigner_args=()

  apksigner="$(resolve_build_tool apksigner)" || {
    echo "Could not find apksigner. Make sure the Android build-tools are installed." >&2
    exit 1
  }

  apksigner_args=(
    sign
    --ks "$ANDROID_KEYSTORE_PATH"
    --ks-pass env:ANDROID_KEYSTORE_PASSWORD
    --key-pass env:ANDROID_KEY_PASSWORD
    --ks-key-alias "$ANDROID_KEY_ALIAS"
    --out "$signed_apk"
  )

  apksigner_args+=("$unsigned_apk")

  "$apksigner" "${apksigner_args[@]}"
  "$apksigner" verify "$signed_apk" >/dev/null
}

copy_apk() {
  local source_apk="$1"
  local destination_apk="$2"

  mkdir -p "$(dirname "$destination_apk")"
  cp -f "$source_apk" "$destination_apk"
}

require_cmd pnpm
require_release_signing
export ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD

cd "$ROOT_DIR"

echo "Building debug APK..."
pnpm tauri android build --apk --debug --ci "$@"

debug_apk="$(latest_debug_apk)"
if [[ -z "${debug_apk:-}" || ! -f "$debug_apk" ]]; then
  echo "Could not find the built debug APK under $APK_OUTPUT_DIR" >&2
  exit 1
fi

debug_output="$DEBUG_DIR/$APP_NAME-debug.apk"
copy_apk "$debug_apk" "$debug_output"
echo "Debug APK copied to $debug_output"

echo "Building release APK..."
pnpm tauri android build --apk --ci "$@"

release_output="$RELEASE_DIR/$APP_NAME-release.apk"
signed_release_apk="$(latest_signed_release_apk || true)"

if [[ -n "${signed_release_apk:-}" && -f "$signed_release_apk" ]]; then
  copy_apk "$signed_release_apk" "$release_output"
else
  unsigned_release_apk="$(latest_unsigned_release_apk || true)"
  if [[ -z "${unsigned_release_apk:-}" || ! -f "$unsigned_release_apk" ]]; then
    echo "Could not find the built release APK under $APK_OUTPUT_DIR" >&2
    exit 1
  fi

  mkdir -p "$RELEASE_DIR"
  sign_release_apk "$unsigned_release_apk" "$release_output"
fi

echo "Release APK copied to $release_output"
