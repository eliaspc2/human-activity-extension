#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$ROOT_DIR/dist"
ARCHIVE_PATH="$OUTPUT_DIR/human-activity-extension.zip"
UNIVERSAL_ARCHIVE_PATH="$OUTPUT_DIR/human-activity-extension-universal.zip"

mkdir -p "$OUTPUT_DIR"
rm -f "$ARCHIVE_PATH" "$UNIVERSAL_ARCHIVE_PATH"

(
  cd "$ROOT_DIR"
  zip -r "$ARCHIVE_PATH" \
    manifest.json \
    background.js \
    content.js \
    icons \
    install-chrome.sh \
    install-chrome-macos.sh \
    install-chrome-windows.ps1 \
    native \
    install-native-host.py \
    install-native-host.sh \
    README.md \
    LICENSE
)

( 
  cd "$OUTPUT_DIR"
  cp "$(basename "$ARCHIVE_PATH")" "$(basename "$UNIVERSAL_ARCHIVE_PATH")"
)

echo "Created $ARCHIVE_PATH"
echo "Created $UNIVERSAL_ARCHIVE_PATH"
