#!/usr/bin/env bash

set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 2 ]]; then
  cat <<'EOF'
Usage:
  bash scripts/android-install-apk.sh <package-name> <apk-path>

Installs an APK. If adb reports INSTALL_FAILED_UPDATE_INCOMPATIBLE,
the script fully uninstalls the package for every Android user/profile and retries once.
EOF
  exit 0
fi

PACKAGE_NAME="$1"
APK_PATH="$2"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNINSTALL_SCRIPT="$ROOT_DIR/scripts/android-uninstall-package.sh"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd adb

if [[ ! -f "$APK_PATH" ]]; then
  echo "APK not found: $APK_PATH" >&2
  exit 1
fi

attempt_install() {
  adb install -r "$APK_PATH" 2>&1
}

INSTALL_OUTPUT="$(attempt_install)" || INSTALL_STATUS=$?
INSTALL_STATUS="${INSTALL_STATUS:-0}"

if [[ "$INSTALL_STATUS" -eq 0 ]]; then
  printf '%s\n' "$INSTALL_OUTPUT"
  exit 0
fi

printf '%s\n' "$INSTALL_OUTPUT" >&2

if [[ "$INSTALL_OUTPUT" == *"INSTALL_FAILED_UPDATE_INCOMPATIBLE"* ]]; then
  echo "Signature mismatch detected. Removing existing $PACKAGE_NAME installs and retrying..." >&2
  bash "$UNINSTALL_SCRIPT" "$PACKAGE_NAME"
  adb install -r "$APK_PATH"
  exit 0
fi

exit "$INSTALL_STATUS"
