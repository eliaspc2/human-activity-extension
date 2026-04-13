#!/usr/bin/env bash
set -euo pipefail

REPO_OWNER="${REPO_OWNER:-eliaspc2}"
REPO_NAME="${REPO_NAME:-human-activity-extension}"
EXTENSION_ID="${EXTENSION_ID:-hfdolihdgipfjjkiojkocmcbnbbpjipn}"
UPDATE_URL="https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/updates.xml"
RELEASE_CRX_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest/download/human-activity-extension.crx"
INSTALL_DIR="/opt/google/chrome/local-extensions"
EXTERNAL_DIR="/opt/google/chrome/extensions"
CRX_PATH="${INSTALL_DIR}/human-activity-extension.crx"
EXTERNAL_JSON_PATH="${EXTERNAL_DIR}/${EXTENSION_ID}.json"
RESTART_CHROME=0
RESTORE_ONLY=0
LOCAL_CRX=""
LOCAL_VERSION=""
DISPLAY_VALUE="${DISPLAY:-}"
XAUTHORITY_VALUE="${XAUTHORITY:-}"
DBUS_VALUE="${DBUS_SESSION_BUS_ADDRESS:-}"

usage() {
  cat <<'EOF'
Install Human Activity Extension into Google Chrome on Linux.

Usage:
  ./install-chrome.sh [--restart-chrome]
  ./install-chrome.sh --crx /path/to/human-activity-extension.crx --version 2.4.0 [--restart-chrome]
  ./install-chrome.sh --restore-update-channel

Options:
  --crx PATH          Install from a local CRX instead of GitHub latest release.
  --version VERSION   Required with --crx. Used for the initial Chrome bootstrap.
  --restart-chrome    Best-effort restart of Google Chrome after installing.
  --restore-update-channel
                     Restore the normal GitHub update manifest without bootstrapping a local CRX.
  -h, --help          Show this help.
EOF
}

log() {
  printf '[human-activity-installer] %s\n' "$1"
}

fail() {
  printf '[human-activity-installer] %s\n' "$1" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --crx)
        [ "$#" -ge 2 ] || fail "Missing value for --crx"
        LOCAL_CRX="$2"
        shift 2
        ;;
      --version)
        [ "$#" -ge 2 ] || fail "Missing value for --version"
        LOCAL_VERSION="$2"
        shift 2
        ;;
      --restart-chrome)
        RESTART_CHROME=1
        shift
        ;;
      --restore-update-channel)
        RESTORE_ONLY=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        fail "Unknown argument: $1"
        ;;
    esac
  done
}

ensure_root() {
  if [ "$(id -u)" -eq 0 ]; then
    return
  fi

  need_command sudo
  exec sudo env \
    DISPLAY="${DISPLAY_VALUE}" \
    XAUTHORITY="${XAUTHORITY_VALUE}" \
    DBUS_SESSION_BUS_ADDRESS="${DBUS_VALUE}" \
    bash "$0" "$@"
}

resolve_target_user() {
  if [ -n "${SUDO_USER:-}" ] && [ "${SUDO_USER}" != "root" ]; then
    TARGET_USER="${SUDO_USER}"
  else
    TARGET_USER="$(id -un)"
  fi

  TARGET_HOME="$(getent passwd "${TARGET_USER}" | cut -d: -f6)"
  [ -n "${TARGET_HOME}" ] || fail "Could not resolve home directory for ${TARGET_USER}"
}

resolve_chrome_command() {
  if command -v google-chrome >/dev/null 2>&1; then
    CHROME_CMD="google-chrome"
    CHROME_PROCESS_PATH="/opt/google/chrome/chrome"
    return
  fi

  if command -v google-chrome-stable >/dev/null 2>&1; then
    CHROME_CMD="google-chrome-stable"
    CHROME_PROCESS_PATH="$(readlink -f "$(command -v google-chrome-stable)")"
    return
  fi

  fail "Google Chrome does not seem to be installed on this system."
}

download_latest_version() {
  curl -fsSL "${UPDATE_URL}" | sed -n 's/.*version="\([0-9.]*\)".*/\1/p' | head -n1
}

write_bootstrap_manifest() {
  local version="$1"
  cat > "${EXTERNAL_JSON_PATH}" <<EOF
{"external_crx": "${CRX_PATH}", "external_version": "${version}"}
EOF
}

write_update_manifest() {
  cat > "${EXTERNAL_JSON_PATH}" <<EOF
{"external_update_url": "${UPDATE_URL}"}
EOF
}

find_installed_extension_path() {
  find "${TARGET_HOME}/.config/google-chrome" -maxdepth 4 -type d \
    -path "*/Extensions/${EXTENSION_ID}/${1}_0" -print -quit 2>/dev/null || true
}

restart_chrome() {
  if pgrep -u "${TARGET_USER}" -f "${CHROME_PROCESS_PATH}" >/dev/null 2>&1; then
    log "Restarting Google Chrome for ${TARGET_USER}"
    pkill -u "${TARGET_USER}" -f "${CHROME_PROCESS_PATH}" || true
    sleep 2
  else
    log "Google Chrome was not running for ${TARGET_USER}; starting it now"
  fi

  sudo -u "${TARGET_USER}" env \
    DISPLAY="${DISPLAY:-}" \
    XAUTHORITY="${XAUTHORITY:-}" \
    DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-}" \
    "${CHROME_CMD}" >/dev/null 2>&1 &
}

wait_for_install() {
  local version="$1"

  for _ in $(seq 1 60); do
    if [ -n "$(find_installed_extension_path "${version}")" ]; then
      return 0
    fi
    sleep 1
  done

  return 1
}

main() {
  parse_args "$@"

  [ "$(uname -s)" = "Linux" ] || fail "This installer currently supports Linux only."

  if [ "${RESTORE_ONLY}" -eq 1 ] && [ -n "${LOCAL_CRX}" ]; then
    fail "--restore-update-channel cannot be combined with --crx."
  fi

  if [ -n "${LOCAL_CRX}" ] && [ -z "${LOCAL_VERSION}" ]; then
    fail "--version is required when --crx is used."
  fi

  ensure_root "$@"
  resolve_target_user
  resolve_chrome_command
  need_command curl
  need_command install
  need_command getent

  if [ "${RESTORE_ONLY}" -eq 1 ]; then
    write_update_manifest
    log "Restored the GitHub update channel in ${EXTERNAL_JSON_PATH}"
    exit 0
  fi

  local work_dir version source_crx
  work_dir="$(mktemp -d)"
  trap 'rm -rf "${work_dir}"' EXIT

  if [ -n "${LOCAL_CRX}" ]; then
    [ -f "${LOCAL_CRX}" ] || fail "Local CRX not found: ${LOCAL_CRX}"
    source_crx="${LOCAL_CRX}"
    version="${LOCAL_VERSION}"
    log "Using local CRX ${source_crx} (v${version})"
  else
    version="$(download_latest_version)"
    [ -n "${version}" ] || fail "Could not detect latest version from ${UPDATE_URL}"
    source_crx="${work_dir}/human-activity-extension.crx"
    log "Downloading Human Activity Extension v${version} from GitHub"
    curl -fL "${RELEASE_CRX_URL}" -o "${source_crx}"
  fi

  install -d -m 0755 "${INSTALL_DIR}" "${EXTERNAL_DIR}"
  install -m 0644 "${source_crx}" "${CRX_PATH}"
  write_bootstrap_manifest "${version}"
  log "Bootstrap manifest written to ${EXTERNAL_JSON_PATH}"

  if [ "${RESTART_CHROME}" -eq 1 ]; then
    restart_chrome
    if wait_for_install "${version}"; then
      log "Chrome picked up v${version}; restoring external update channel"
      write_update_manifest
    else
      log "Chrome did not confirm the install in time; leaving bootstrap manifest for now"
      log "Restart Chrome manually once and rerun this script without --crx to restore the update channel"
      exit 0
    fi
  else
    log "Restart Chrome to finish the install, then rerun this script without --crx if you want to restore the update channel immediately"
    log "The extension will still install from the local CRX on next Chrome launch."
    exit 0
  fi

  log "Installation complete. Future updates will follow ${UPDATE_URL}"
}

main "$@"
