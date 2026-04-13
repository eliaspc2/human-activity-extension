#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_PATH="${KEY_PATH:-$HOME/.local/share/human-activity-extension/human-activity-extension.pem}"
WORK_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$WORK_DIR"
}

trap cleanup EXIT

if [ ! -f "$KEY_PATH" ]; then
  echo "Missing signing key: $KEY_PATH" >&2
  exit 1
fi

cp "$ROOT_DIR/manifest.json" "$WORK_DIR/"
cp "$ROOT_DIR/background.js" "$WORK_DIR/"
cp "$ROOT_DIR/content.js" "$WORK_DIR/"
cp "$ROOT_DIR/README.md" "$WORK_DIR/"
cp "$ROOT_DIR/LICENSE" "$WORK_DIR/"
cp -R "$ROOT_DIR/icons" "$WORK_DIR/"

google-chrome --no-message-box \
  --pack-extension="$WORK_DIR" \
  --pack-extension-key="$KEY_PATH"

mv "$WORK_DIR.crx" "$ROOT_DIR.crx"

echo "Created $ROOT_DIR.crx"
