#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$ROOT_DIR/dist"
WORK_DIR="$(mktemp -d)"
ZIP_PATH="$OUTPUT_DIR/human-activity-extension-firefox.zip"
XPI_PATH="$OUTPUT_DIR/human-activity-extension-firefox.xpi"

cleanup() {
  rm -rf "$WORK_DIR"
}

trap cleanup EXIT

mkdir -p "$OUTPUT_DIR"
rm -f "$ZIP_PATH" "$XPI_PATH"

cp "$ROOT_DIR/background.js" "$WORK_DIR/"
cp "$ROOT_DIR/content.js" "$WORK_DIR/"
cp "$ROOT_DIR/README.md" "$WORK_DIR/"
cp "$ROOT_DIR/LICENSE" "$WORK_DIR/"
cp -R "$ROOT_DIR/icons" "$WORK_DIR/"

jq 'del(.update_url, .minimum_chrome_version)' \
  "$ROOT_DIR/manifest.json" > "$WORK_DIR/manifest.json"

(
  cd "$WORK_DIR"
  zip -rq "$ZIP_PATH" \
    manifest.json \
    background.js \
    content.js \
    icons \
    README.md \
    LICENSE
)

cp "$ZIP_PATH" "$XPI_PATH"

echo "Created $ZIP_PATH"
echo "Created $XPI_PATH"
