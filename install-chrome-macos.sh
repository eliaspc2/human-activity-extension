#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="${REPO_OWNER:-eliaspc2}"
REPO_NAME="${REPO_NAME:-human-activity-extension}"
DOWNLOAD_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/human-activity-extension-universal.zip"
TARGET_DIR="${TARGET_DIR:-$HOME/Library/Application Support/Human Activity Extension/chrome-unpacked}"
CHROME_APP_PATH="${CHROME_APP_PATH:-/Applications/Google Chrome.app}"

usage() {
  cat <<'EOF'
Prepare Human Activity Extension for Google Chrome on macOS.

This helper downloads the latest universal package, extracts it to a stable
folder, opens Chrome's extensions page, and reveals the folder in Finder.

Because Chrome only allows direct self-hosted installs in managed environments
on macOS, the final "Load unpacked" step still has to be confirmed by you.

Usage:
  ./install-chrome-macos.sh
  TARGET_DIR="/custom/path" ./install-chrome-macos.sh
EOF
}

log() {
  printf '[human-activity-macos] %s\n' "$1"
}

fail() {
  printf '[human-activity-macos] %s\n' "$1" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

main() {
  case "${1:-}" in
    -h|--help)
      usage
      exit 0
      ;;
    "")
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac

  [ "$(uname -s)" = "Darwin" ] || fail "This helper is for macOS only."

  need_command curl
  need_command unzip
  need_command mktemp
  need_command open

  local work_dir zip_path
  work_dir="$(mktemp -d)"
  trap 'rm -rf "${work_dir}"' EXIT
  zip_path="${work_dir}/human-activity-extension-universal.zip"

  log "Downloading latest package from GitHub"
  curl -fL "${DOWNLOAD_URL}" -o "${zip_path}"

  log "Preparing extracted extension folder at ${TARGET_DIR}"
  rm -rf "${TARGET_DIR}"
  mkdir -p "${TARGET_DIR}"
  unzip -q "${zip_path}" -d "${TARGET_DIR}"

  if [ -d "${CHROME_APP_PATH}" ]; then
    open -a "${CHROME_APP_PATH}" "chrome://extensions" >/dev/null 2>&1 || true
  else
    open "chrome://extensions" >/dev/null 2>&1 || true
  fi

  open "${TARGET_DIR}"

  cat <<EOF

Human Activity Extension is ready for Chrome on macOS.

Next steps in Chrome:
  1. Turn on Developer mode.
  2. Click "Load unpacked".
  3. Select this folder:
     ${TARGET_DIR}

Chrome on macOS does not support direct self-hosted one-click installs outside
managed environments, so this helper prepares everything up to the last click.
EOF
}

main "$@"
