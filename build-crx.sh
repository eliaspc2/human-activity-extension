#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KEY_PATH="${KEY_PATH:-$HOME/.local/share/human-activity-extension/human-activity-extension.pem}"

if [ ! -f "$KEY_PATH" ]; then
  echo "Missing signing key: $KEY_PATH" >&2
  exit 1
fi

google-chrome --no-message-box \
  --pack-extension="$ROOT_DIR" \
  --pack-extension-key="$KEY_PATH"

echo "Created $ROOT_DIR.crx"
