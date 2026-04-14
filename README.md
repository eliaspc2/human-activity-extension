# Human Activity Extension

`Human Activity Extension` is a free and open-source browser extension for Chrome and Firefox that injects a floating controller into the current tab and simulates low-intensity activity patterns inspired by the original bookmarklet.

[![Install on Chrome Linux](https://img.shields.io/badge/Install_on_Chrome-Linux_installer-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/eliaspc2/human-activity-extension/releases/latest/download/human-activity-extension-linux-installer.sh)
[![Add to Firefox](https://img.shields.io/badge/Add_to_Firefox-GitHub_build-FF7139?style=for-the-badge&logo=firefoxbrowser&logoColor=white)](#install-in-firefox-from-github)
[![Latest Release](https://img.shields.io/github/v/release/eliaspc2/human-activity-extension?style=for-the-badge)](https://github.com/eliaspc2/human-activity-extension/releases/latest)

## Quick install

- [Install on Chrome on Linux](#install-in-chrome-on-linux)
- [Add to Firefox](#install-in-firefox-from-github)
- [Latest release assets](https://github.com/eliaspc2/human-activity-extension/releases/latest)

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
  - which actions stay active
  - action weight variance
  - quick time extensions
- Supports `Pause` and `Resume` without losing session progress.
- Can restore itself after a page refresh on the same tab.
- Lets you enable or disable `scroll`, `mouse move`, `click`, and `refresh` separately, starting from an average-human profile.
- Includes a `Check updates` control in the panel header for manual update checks.
- Can lock the computer when the timer finishes if the local native host is installed.
- Keeps automatic screen locking inhibited only while a session is actively running when the local native host is installed.
- Tries to keep the screen awake using the Wake Lock API when available as an extra browser-level fallback.

## How it works

The extension does not run automatically on every site. Click the extension icon while you are on a normal web page, and it injects the controller into that tab.

## Install in Chrome on Linux

The closest thing to a one-command install on Chrome is the Linux installer script:

```bash
curl -fsSL -o /tmp/human-activity-extension-linux-installer.sh \
  https://github.com/eliaspc2/human-activity-extension/releases/latest/download/human-activity-extension-linux-installer.sh

bash /tmp/human-activity-extension-linux-installer.sh --restart-chrome
```

What it does:

- downloads the latest signed `CRX`
- installs the Chrome external-extension bootstrap files under `/opt/google/chrome/`
- can restart `Google Chrome` to make the install land immediately
- restores the normal GitHub update channel after the bootstrap succeeds

If you prefer, clicking the `Install on Chrome` badge downloads the same installer script.

If you are testing the normal Chrome update cycle after the extension is already installed, do not rerun the Linux installer. Leave the existing install in place and let Chrome pick up the new version from `update_url`, or use the in-panel `↻` button to request a check.

## Install in Chrome from GitHub

Direct public one-click install is still not available from GitHub alone in Chrome outside Linux/admin flows, so the manual GitHub path is:

1. Download the latest source package or clone this repository.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the extracted project folder.

Useful links:

- [Latest Linux installer](https://github.com/eliaspc2/human-activity-extension/releases/latest/download/human-activity-extension-linux-installer.sh)
- [Latest release page](https://github.com/eliaspc2/human-activity-extension/releases/latest)
- [Latest universal zip](https://github.com/eliaspc2/human-activity-extension/releases/latest/download/human-activity-extension-universal.zip)
- [Repository source](https://github.com/eliaspc2/human-activity-extension)

## Install locally in Chrome

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the project folder you cloned or extracted, for example:

```text
/path/to/human-activity-extension
```

## Install in Firefox from GitHub

Firefox can use the GitHub build directly, but for a normal permanent install it still needs Mozilla signing. From GitHub, the practical path is:

1. Download the latest Firefox package:
   - [Latest Firefox XPI](https://github.com/eliaspc2/human-activity-extension/releases/latest/download/human-activity-extension-firefox.xpi)
2. Open `about:debugging#/runtime/this-firefox`.
3. Click `Load Temporary Add-on`.
4. Choose the downloaded `.xpi`.

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

## Optional: native helper for anti-lock and finish lock

The local native host unlocks two system-level behaviors:

- prevent automatic screen locking only while the session is actively `RUNNING`
- power the optional `Lock computer when finished` checkbox

The idle inhibition is released automatically when the session is paused, stopped, finished, the tab goes away, or the browser tears down the native port.

From the repository root:

```bash
python3 install-native-host.py
```

That installs per-user native messaging manifests for the current OS and for:

- Google Chrome
- Firefox

and wires them to the local helper in `native/lock_host.py`.

Supported native backends in the helper:

- Linux:
  - anti-lock while running: `systemd-inhibit` with `gnome-session-inhibit` as fallback
  - finish lock: `loginctl`, KDE/ScreenSaver DBus, or `xdg-screensaver`
- macOS:
  - anti-lock while running: `caffeinate`
  - finish lock: `CGSession -suspend`
- Windows:
  - anti-lock while running: `SetThreadExecutionState`
  - finish lock: `rundll32 user32.dll,LockWorkStation`

## Usage

1. Open a regular web page.
2. Click the extension icon.
3. Use the floating panel to configure the duration and action interval.
4. Leave the default action mix as-is for a medium human profile, or toggle individual actions on and off.
5. Adjust `Action variance` if you want the action weights to fluctuate more or less over time.
6. Use the `↻` button in the panel header if you want to ask the browser to check for a newer extension build.
7. If the native host is installed, the extension automatically suppresses auto-lock only while the session is running.
8. Optionally enable `Lock computer when finished`.
9. Click `Start`.
10. Click `Pause` to freeze the session and `Start` again to resume it.
11. Click `Stop` to halt the session or `x` to remove the panel from the page.

## Project structure

- `manifest.json` - shared MV3 manifest prepared for Chrome and Firefox.
- `background.js` - toolbar click handler with Chrome and Firefox API fallbacks.
- `content.js` - floating UI and simulation logic injected into the current tab.
- `updates.xml` - Chrome update manifest for self-hosted updates.
- `install-chrome.sh` - Linux installer that bootstraps Chrome and restores the GitHub update channel.
- `build-crx.sh` - builds a signed `CRX` using the stable private key.
- `build-firefox.sh` - creates Firefox-ready release packages from the same codebase.
- `install-native-host.py` - installs the optional native host for anti-lock while running and computer lock on finish.
- `publish-release.sh` - publishes the Chrome and Firefox release artifacts to the matching GitHub release.

## Packaging

If you want a simple source zip that stays compatible with both Chrome and Firefox:

```bash
./package-extension.sh
```

The script creates:

```text
dist/human-activity-extension.zip
dist/human-activity-extension-universal.zip
```

The contents are the same shared source package:

- in Chrome, unzip it and use `Load unpacked`
- in Firefox, you can also load the extracted folder during development, or use the dedicated `.xpi` from `build-firefox.sh`

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
- the panel `↻` button only asks the browser to run an update check sooner; it does not bypass Chrome's extension update model
- if you want to test the update flow, keep the existing installed build and publish a newer signed release plus matching `updates.xml`

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
