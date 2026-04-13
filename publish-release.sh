#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(jq -r '.version' "$ROOT_DIR/manifest.json")"
TAG="v$VERSION"
CRX_PATH="$ROOT_DIR.crx"

"$ROOT_DIR/build-crx.sh"

if gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" "$CRX_PATH#human-activity-extension.crx" --clobber
else
  gh release create "$TAG" "$CRX_PATH#human-activity-extension.crx" \
    --title "$TAG" \
    --notes "Signed CRX release for Human Activity Extension $VERSION."
fi

echo "Published release asset for $TAG"
