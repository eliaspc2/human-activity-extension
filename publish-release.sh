#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(jq -r '.version' "$ROOT_DIR/manifest.json")"
TAG="v$VERSION"
CRX_PATH="$ROOT_DIR.crx"
FIREFOX_ZIP_PATH="$ROOT_DIR/dist/human-activity-extension-firefox.zip"
FIREFOX_XPI_PATH="$ROOT_DIR/dist/human-activity-extension-firefox.xpi"
UNIVERSAL_ZIP_PATH="$ROOT_DIR/dist/human-activity-extension-universal.zip"
LINUX_INSTALLER_PATH="$ROOT_DIR/install-chrome.sh"
LINUX_INSTALLER_ASSET_PATH="$ROOT_DIR/dist/human-activity-extension-linux-installer.sh"

"$ROOT_DIR/build-crx.sh"
"$ROOT_DIR/build-firefox.sh"
"$ROOT_DIR/package-extension.sh"
cp "$LINUX_INSTALLER_PATH" "$LINUX_INSTALLER_ASSET_PATH"
chmod +x "$LINUX_INSTALLER_ASSET_PATH"

if gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" \
    "$CRX_PATH#human-activity-extension.crx" \
    "$LINUX_INSTALLER_ASSET_PATH#human-activity-extension-linux-installer.sh" \
    "$FIREFOX_ZIP_PATH#human-activity-extension-firefox.zip" \
    "$FIREFOX_XPI_PATH#human-activity-extension-firefox.xpi" \
    "$UNIVERSAL_ZIP_PATH#human-activity-extension-universal.zip" \
    --clobber
else
  gh release create "$TAG" \
    "$CRX_PATH#human-activity-extension.crx" \
    "$LINUX_INSTALLER_ASSET_PATH#human-activity-extension-linux-installer.sh" \
    "$FIREFOX_ZIP_PATH#human-activity-extension-firefox.zip" \
    "$FIREFOX_XPI_PATH#human-activity-extension-firefox.xpi" \
    "$UNIVERSAL_ZIP_PATH#human-activity-extension-universal.zip" \
    --title "$TAG" \
    --notes "Cross-browser release for Human Activity Extension $VERSION."
fi

echo "Published release asset for $TAG"
