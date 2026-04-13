#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$ROOT_DIR/dist"
ARCHIVE_PATH="$OUTPUT_DIR/human-activity-extension.zip"

mkdir -p "$OUTPUT_DIR"
rm -f "$ARCHIVE_PATH"

(
  cd "$ROOT_DIR"
  zip -r "$ARCHIVE_PATH" \
    manifest.json \
    background.js \
    content.js \
    README.md \
    LICENSE
)

echo "Created $ARCHIVE_PATH"
