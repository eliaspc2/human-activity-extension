#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(jq -r '.version' "$ROOT_DIR/manifest.json")"
TAG="v$VERSION"
CRX_PATH="$ROOT_DIR.crx"
FIREFOX_ZIP_PATH="$ROOT_DIR/dist/human-activity-extension-firefox.zip"
FIREFOX_XPI_PATH="$ROOT_DIR/dist/human-activity-extension-firefox.xpi"

"$ROOT_DIR/build-crx.sh"
"$ROOT_DIR/build-firefox.sh"

if gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" \
    "$CRX_PATH#human-activity-extension.crx" \
    "$FIREFOX_ZIP_PATH#human-activity-extension-firefox.zip" \
    "$FIREFOX_XPI_PATH#human-activity-extension-firefox.xpi" \
    --clobber
else
  gh release create "$TAG" \
    "$CRX_PATH#human-activity-extension.crx" \
    "$FIREFOX_ZIP_PATH#human-activity-extension-firefox.zip" \
    "$FIREFOX_XPI_PATH#human-activity-extension-firefox.xpi" \
    --title "$TAG" \
    --notes "Cross-browser release for Human Activity Extension $VERSION."
fi

echo "Published release asset for $TAG"
