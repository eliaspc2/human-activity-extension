#!/usr/bin/env python3
import json
import os
import platform
import shutil
import struct
import subprocess
import sys


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    if len(raw_length) < 4:
        raise RuntimeError("Invalid message length header.")
    message_length = struct.unpack("@I", raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)


def send_message(payload):
    encoded = json.dumps(payload).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("@I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def try_command(command):
    if not command or shutil.which(command[0]) is None:
        return False

    try:
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
    except OSError:
        return False

    return completed.returncode == 0


def prepare_binary_stdio_for_windows():
    if platform.system() != "Windows":
        return

    import msvcrt

    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


def detect_session_id():
    env_session = os.environ.get("XDG_SESSION_ID")
    if env_session:
        return env_session

    loginctl = shutil.which("loginctl")
    if not loginctl:
        return None

    try:
        result = subprocess.run(
            [loginctl, "list-sessions", "--no-legend"],
            check=False,
            capture_output=True,
            text=True
        )
    except OSError:
        return None

    if result.returncode != 0:
        return None

    current_user = os.environ.get("USER")
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[2] == current_user:
            return parts[0]

    return None


def lock_session():
    system = platform.system()
    commands = []

    if system == "Linux":
        session_id = detect_session_id()
        if session_id:
            commands.append(["loginctl", "lock-session", session_id])

        commands.extend([
            ["loginctl", "lock-sessions"],
            ["qdbus6", "org.freedesktop.ScreenSaver", "/ScreenSaver", "org.freedesktop.ScreenSaver.Lock"],
            ["qdbus", "org.freedesktop.ScreenSaver", "/ScreenSaver", "org.freedesktop.ScreenSaver.Lock"],
            [
                "dbus-send",
                "--session",
                "--dest=org.freedesktop.ScreenSaver",
                "--type=method_call",
                "/ScreenSaver",
                "org.freedesktop.ScreenSaver.Lock"
            ],
            ["xdg-screensaver", "lock"]
        ])
    elif system == "Darwin":
        commands.extend([
            ["/System/Library/CoreServices/Menu Extras/User.menu/Contents/Resources/CGSession", "-suspend"],
            ["pmset", "displaysleepnow"]
        ])
    elif system == "Windows":
        commands.extend([
            ["rundll32.exe", "user32.dll,LockWorkStation"]
        ])
    else:
        return {
            "ok": False,
            "locked": False,
            "error": f"Unsupported OS: {system}"
        }

    for command in commands:
        if try_command(command):
            return {
                "ok": True,
                "locked": True,
                "command": command[0]
            }

    return {
        "ok": False,
        "locked": False,
        "error": "No supported lock command succeeded."
    }


def main():
    try:
        prepare_binary_stdio_for_windows()
        message = read_message()
        if message is None:
            return

        action = message.get("action")
        if action == "lock":
            send_message(lock_session())
            return

        if action == "ping":
            send_message({"ok": True, "pong": True})
            return

        send_message({"ok": False, "error": f"Unsupported action: {action}"})
    except Exception as error:  # noqa: BLE001
        send_message({"ok": False, "error": str(error)})


if __name__ == "__main__":
    main()
