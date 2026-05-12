#!/usr/bin/env bash

set -euo pipefail

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || $# -lt 1 ]]; then
  cat <<'EOF'
Usage:
  bash scripts/android-uninstall-package.sh <package-name>

Removes the package for every Android user/profile reported by `pm list users`.
EOF
  exit 0
fi

PACKAGE_NAME="$1"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd adb

mapfile -t USER_IDS < <(
  adb shell pm list users \
    | grep -oE 'UserInfo\{[0-9]+' \
    | grep -oE '[0-9]+'
)

if [[ "${#USER_IDS[@]}" -eq 0 ]]; then
  echo "Could not detect Android users with \`adb shell pm list users\`." >&2
  exit 1
fi

for user_id in "${USER_IDS[@]}"; do
  echo "Uninstalling $PACKAGE_NAME for Android user $user_id..."
  adb shell cmd package uninstall --user "$user_id" "$PACKAGE_NAME" || true
done

echo "Finished uninstall attempts for $PACKAGE_NAME"
