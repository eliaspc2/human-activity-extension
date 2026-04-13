# Human Activity Extension

`Human Activity Extension` is a free and open-source Chrome extension that injects a floating controller into the current tab and simulates low-intensity activity patterns inspired by the original bookmarklet.

## What it does

- Adds a draggable control panel to the current page.
- Simulates reading-like activity with:
  - smooth scrolling bursts
  - mouse movement
  - neutral clicks on non-interactive areas
- Shows a visual cursor indicator.
- Lets you control:
  - total duration
  - interval range between actions
  - quick time extensions
- Can restore itself after a page refresh on the same tab.
- Can optionally include random page refreshes in the activity cycle.
- Tries to keep the screen awake using the Wake Lock API when available.

## How it works

The extension does not run automatically on every site. Click the extension icon in Chrome while you are on a normal web page, and it injects the controller into that tab.

## Install locally

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the project folder you cloned or extracted, for example:

```text
/path/to/human-activity-extension
```

## Usage

1. Open a regular web page.
2. Click the extension icon.
3. Use the floating panel to configure the duration and action interval.
4. Optionally enable `Allow random refreshes`.
5. Click `Start`.
6. Click `Stop` to halt the session or `x` to remove the panel from the page.

## Project structure

- `manifest.json` - Chrome extension manifest for MV3.
- `background.js` - toolbar click handler that injects the controller.
- `content.js` - floating UI and simulation logic injected into the current tab.
- `updates.xml` - Chrome update manifest for self-hosted updates.
- `build-crx.sh` - builds a signed `CRX` using the stable private key.
- `publish-release.sh` - publishes the signed `CRX` to the matching GitHub release.

## Packaging

If you want a simple zip for distribution:

```bash
./package-extension.sh
```

The script creates:

```text
dist/human-activity-extension.zip
```

If you want a signed `CRX` for local Chrome installation or self-hosted updates:

```bash
./build-crx.sh
```

By default, the script expects the signing key at:

```text
~/.local/share/human-activity-extension/human-activity-extension.pem
```

## Automatic updates

This repository is prepared for Chrome-managed periodic updates on Linux through a hosted update manifest:

- the extension manifest includes an `update_url`
- the repository includes [`updates.xml`](updates.xml)
- releases can publish the signed `CRX` asset that `updates.xml` points to

Important detail:

- `Load unpacked` does not auto-update
- Chrome itself performs periodic update checks when the extension is installed through an update manifest
- the extension does not need to poll GitHub on its own

To build and publish a signed release asset for the current version:

```bash
./publish-release.sh
```

That script:

- builds the `CRX` with the stable signing key
- creates or updates the matching GitHub release
- uploads the `CRX` as a release asset

## Notes

- Chrome blocks extensions on internal pages such as `chrome://`.
- Wake Lock depends on browser support and page conditions.
- Neutral clicks are intentionally conservative and avoid clearly interactive elements.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
