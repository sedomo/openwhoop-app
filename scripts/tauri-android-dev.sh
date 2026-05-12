#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIGNING_ENV_FILE="$ROOT_DIR/.android-signing.env"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'EOF'
Usage:
  bash scripts/tauri-android-dev.sh [extra tauri android dev args]

Runs Tauri Android dev with the shared signing key from ./.android-signing.env.
EOF
  exit 0
fi

if [[ -f "$SIGNING_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$SIGNING_ENV_FILE"
fi

for required_var in ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS; do
  if [[ -z "${!required_var:-}" ]]; then
    echo "Missing required signing value: $required_var" >&2
    echo "Run \`pnpm android:keygen\` first." >&2
    exit 1
  fi
done

if [[ -z "${ANDROID_KEY_PASSWORD:-}" ]]; then
  export ANDROID_KEY_PASSWORD="$ANDROID_KEYSTORE_PASSWORD"
fi

export ANDROID_KEYSTORE_PATH ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS

ANDROID_AVD_DIR="${HOME}/.android/avd"

cleanup_stale_avd_snapshot_state() {
  [[ -d "$ANDROID_AVD_DIR" ]] || return 0

  while IFS= read -r -d '' avd_dir; do
    rm -f \
      "$avd_dir/bootcompleted.ini" \
      "$avd_dir/snapshot.trace" \
      "$avd_dir/read-snapshot.txt" \
      "$avd_dir/multiinstance.lock" || true
  done < <(find "$ANDROID_AVD_DIR" -maxdepth 1 -type d -name '*.avd' -print0)
}

cleanup_stale_avd_snapshot_state

cd "$ROOT_DIR"
pnpm tauri android dev "$@"
