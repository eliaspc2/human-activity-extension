#!/usr/bin/env python3
import json
import os
import platform
import stat
import sys
from pathlib import Path


HOST_NAME = "dev.eliaspc.human_activity_lock"
CHROME_ID = "hfdolihdgipfjjkiojkocmcbnbbpjipn"
FIREFOX_ID = "human-activity-extension@eliaspc.dev"
ROOT_DIR = Path(__file__).resolve().parent
HOST_SCRIPT = ROOT_DIR / "native" / "lock_host.py"


def ensure_executable(path: Path) -> None:
    current_mode = path.stat().st_mode
    path.chmod(current_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def install_linux() -> list[Path]:
    chrome_manifest = Path.home() / ".config/google-chrome/NativeMessagingHosts" / f"{HOST_NAME}.json"
    firefox_manifest = Path.home() / ".mozilla/native-messaging-hosts" / f"{HOST_NAME}.json"

    ensure_executable(HOST_SCRIPT)
    write_json(
        chrome_manifest,
        {
            "name": HOST_NAME,
            "description": "Native lock and idle inhibit helper for Human Activity Extension",
            "path": str(HOST_SCRIPT),
            "type": "stdio",
            "allowed_origins": [f"chrome-extension://{CHROME_ID}/"]
        }
    )
    write_json(
        firefox_manifest,
        {
            "name": HOST_NAME,
            "description": "Native lock and idle inhibit helper for Human Activity Extension",
            "path": str(HOST_SCRIPT),
            "type": "stdio",
            "allowed_extensions": [FIREFOX_ID]
        }
    )
    return [chrome_manifest, firefox_manifest]


def install_macos() -> list[Path]:
    chrome_manifest = (
        Path.home() / "Library/Application Support/Google/Chrome/NativeMessagingHosts" / f"{HOST_NAME}.json"
    )
    firefox_manifest = (
        Path.home() / "Library/Application Support/Mozilla/NativeMessagingHosts" / f"{HOST_NAME}.json"
    )

    ensure_executable(HOST_SCRIPT)
    write_json(
        chrome_manifest,
        {
            "name": HOST_NAME,
            "description": "Native lock and idle inhibit helper for Human Activity Extension",
            "path": str(HOST_SCRIPT),
            "type": "stdio",
            "allowed_origins": [f"chrome-extension://{CHROME_ID}/"]
        }
    )
    write_json(
        firefox_manifest,
        {
            "name": HOST_NAME,
            "description": "Native lock and idle inhibit helper for Human Activity Extension",
            "path": str(HOST_SCRIPT),
            "type": "stdio",
            "allowed_extensions": [FIREFOX_ID]
        }
    )
    return [chrome_manifest, firefox_manifest]


def install_windows() -> list[str]:
    import winreg

    local_app_data = Path(os.environ["LOCALAPPDATA"]) / "HumanActivityExtension"
    host_dir = local_app_data / "NativeMessagingHosts"
    host_dir.mkdir(parents=True, exist_ok=True)

    batch_path = host_dir / "lock_host.bat"
    batch_path.write_text(
        "@echo off\r\n"
        f'py -3 "{HOST_SCRIPT}"\r\n',
        encoding="utf-8"
    )

    chrome_manifest = host_dir / f"{HOST_NAME}.chrome.json"
    firefox_manifest = host_dir / f"{HOST_NAME}.firefox.json"

    write_json(
        chrome_manifest,
        {
            "name": HOST_NAME,
            "description": "Native lock and idle inhibit helper for Human Activity Extension",
            "path": str(batch_path),
            "type": "stdio",
            "allowed_origins": [f"chrome-extension://{CHROME_ID}/"]
        }
    )
    write_json(
        firefox_manifest,
        {
            "name": HOST_NAME,
            "description": "Native lock and idle inhibit helper for Human Activity Extension",
            "path": str(batch_path),
            "type": "stdio",
            "allowed_extensions": [FIREFOX_ID]
        }
    )

    chrome_key = rf"Software\Google\Chrome\NativeMessagingHosts\{HOST_NAME}"
    firefox_key = rf"Software\Mozilla\NativeMessagingHosts\{HOST_NAME}"

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, chrome_key) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(chrome_manifest))

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, firefox_key) as key:
        winreg.SetValueEx(key, "", 0, winreg.REG_SZ, str(firefox_manifest))

    return [str(chrome_manifest), str(firefox_manifest), str(batch_path)]


def main() -> int:
    system = platform.system()
    if system == "Linux":
        created = install_linux()
    elif system == "Darwin":
        created = install_macos()
    elif system == "Windows":
        created = install_windows()
    else:
        print(f"Unsupported OS: {system}", file=sys.stderr)
        return 1

    print("Installed native host support:")
    for item in created:
        print(f"  {item}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
