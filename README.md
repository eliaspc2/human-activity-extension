# Human Activity Extension

`Human Activity Extension` is a free and open-source browser extension for Chrome and Firefox that injects a floating controller into the current tab and simulates low-intensity activity patterns inspired by the original bookmarklet.

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
- Supports `Pause` and `Resume` without losing session progress.
- Can restore itself after a page refresh on the same tab.
- Can optionally include random page refreshes in the activity cycle.
- Tries to keep the screen awake using the Wake Lock API when available.

## How it works

The extension does not run automatically on every site. Click the extension icon while you are on a normal web page, and it injects the controller into that tab.

## Install locally in Chrome

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the project folder you cloned or extracted, for example:

```text
/path/to/human-activity-extension
```

## Install locally in Firefox

Generate a Firefox-ready package from the same source tree:

```bash
./build-firefox.sh
```

The script creates:

```text
dist/human-activity-extension-firefox.zip
dist/human-activity-extension-firefox.xpi
```

Then:

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on`.
3. Choose the generated `.xpi`, or point Firefox to the repository `manifest.json` while developing.

## Usage

1. Open a regular web page.
2. Click the extension icon.
3. Use the floating panel to configure the duration and action interval.
4. Optionally enable `Allow random refreshes`.
5. Click `Start`.
6. Click `Pause` to freeze the session and `Start` again to resume it.
7. Click `Stop` to halt the session or `x` to remove the panel from the page.

## Project structure

- `manifest.json` - shared MV3 manifest prepared for Chrome and Firefox.
- `background.js` - toolbar click handler with Chrome and Firefox API fallbacks.
- `content.js` - floating UI and simulation logic injected into the current tab.
- `updates.xml` - Chrome update manifest for self-hosted updates.
- `build-crx.sh` - builds a signed `CRX` using the stable private key.
- `build-firefox.sh` - creates Firefox-ready release packages from the same codebase.
- `publish-release.sh` - publishes the Chrome and Firefox release artifacts to the matching GitHub release.

## Packaging

If you want a simple source zip for local distribution:

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

If you want Firefox packages from the same codebase:

```bash
./build-firefox.sh
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
- builds the Firefox `.zip` and `.xpi`
- creates or updates the matching GitHub release
- uploads all release artifacts

## Notes

- Chrome blocks extensions on internal pages such as `chrome://`.
- Firefox blocks extensions on internal pages such as `about:`.
- Wake Lock depends on browser support and page conditions.
- Neutral clicks are intentionally conservative and avoid clearly interactive elements.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
