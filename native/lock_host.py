#!/usr/bin/env python3
import json
import os
import platform
import shutil
import signal
import struct
import subprocess
import sys
import time


HOST_LABEL = "Human Activity Extension"
IDLE_INHIBIT_REASON = "Human Activity session is running"
WINDOWS_INHIBIT_WORKER_ARG = "--windows-inhibit-worker"


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


def prepare_binary_stdio_for_windows():
    if platform.system() != "Windows":
        return

    import msvcrt

    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


def try_command(command):
    if not command or shutil.which(command[0]) is None:
        return False

    try:
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
    except OSError:
        return False

    return completed.returncode == 0


def spawn_process(command):
    if not command or shutil.which(command[0]) is None:
        return None

    try:
        return subprocess.Popen(  # noqa: S603
            command,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=False
        )
    except OSError:
        return None


def terminate_process(process):
    if process is None:
        return True

    if process.poll() is not None:
        return True

    try:
        process.terminate()
        process.wait(timeout=5)
        return True
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)
        return True
    except OSError:
        return False


def python_keepalive_command():
    return [
        sys.executable,
        "-c",
        (
            "import signal, sys, time;"
            "signal.signal(signal.SIGTERM, lambda *_: sys.exit(0));"
            "signal.signal(signal.SIGINT, lambda *_: sys.exit(0));"
            "while True: time.sleep(3600)"
        )
    ]


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


def windows_inhibit_worker():
    import ctypes

    ES_CONTINUOUS = 0x80000000
    ES_SYSTEM_REQUIRED = 0x00000001
    ES_DISPLAY_REQUIRED = 0x00000002

    kernel32 = ctypes.windll.kernel32
    flags = ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED

    if not kernel32.SetThreadExecutionState(flags):
        return 1

    try:
        while True:
            time.sleep(30)
            kernel32.SetThreadExecutionState(flags)
    except KeyboardInterrupt:
        return 0
    finally:
        kernel32.SetThreadExecutionState(ES_CONTINUOUS)


class IdleInhibitor:
    def __init__(self):
        self.process = None
        self.backend = None

    def supports_current_os(self):
        return platform.system() in {"Linux", "Darwin", "Windows"}

    def is_active(self):
        if self.process is None:
            return False
        if self.process.poll() is not None:
            self.process = None
            self.backend = None
            return False
        return True

    def start(self):
        if self.is_active():
            return {
                "ok": True,
                "active": True,
                "backend": self.backend,
                "already_active": True
            }

        system = platform.system()
        if system == "Linux":
            candidates = [
                (
                    [
                        "systemd-inhibit",
                        "--what=idle",
                        "--who",
                        HOST_LABEL,
                        "--why",
                        IDLE_INHIBIT_REASON,
                        *python_keepalive_command()
                    ],
                    "systemd-inhibit"
                ),
                (
                    [
                        "gnome-session-inhibit",
                        "--inhibit",
                        "idle",
                        "--reason",
                        IDLE_INHIBIT_REASON,
                        *python_keepalive_command()
                    ],
                    "gnome-session-inhibit"
                )
            ]
        elif system == "Darwin":
            candidates = [
                (["caffeinate", "-dimsu"], "caffeinate")
            ]
        elif system == "Windows":
            candidates = [
                ([sys.executable, __file__, WINDOWS_INHIBIT_WORKER_ARG], "SetThreadExecutionState")
            ]
        else:
            return {
                "ok": False,
                "active": False,
                "error": f"Unsupported OS: {system}"
            }

        for command, backend in candidates:
            process = spawn_process(command)
            if process is None:
                continue

            time.sleep(0.2)
            if process.poll() is not None:
                continue

            self.process = process
            self.backend = backend
            return {
                "ok": True,
                "active": True,
                "backend": backend
            }

        return {
            "ok": False,
            "active": False,
            "error": "No supported idle inhibit backend succeeded."
        }

    def stop(self):
        if not self.is_active():
            return {
                "ok": True,
                "active": False,
                "already_stopped": True
            }

        backend = self.backend
        process = self.process
        self.process = None
        self.backend = None

        if terminate_process(process):
            return {
                "ok": True,
                "active": False,
                "backend": backend
            }

        return {
            "ok": False,
            "active": False,
            "backend": backend,
            "error": "Idle inhibit process could not be terminated cleanly."
        }

    def status(self):
        return {
            "ok": True,
            "active": self.is_active(),
            "backend": self.backend
        }


def handle_action(message, inhibitor):
    action = message.get("action")

    if action == "lock":
        return lock_session()

    if action == "ping":
        return {
            "ok": True,
            "pong": True,
            "idle_inhibit_supported": inhibitor.supports_current_os()
        }

    if action == "start_inhibit":
        return inhibitor.start()

    if action == "stop_inhibit":
        return inhibitor.stop()

    if action == "inhibit_status":
        return inhibitor.status()

    return {"ok": False, "error": f"Unsupported action: {action}"}


def main():
    if len(sys.argv) > 1 and sys.argv[1] == WINDOWS_INHIBIT_WORKER_ARG:
        return windows_inhibit_worker()

    inhibitor = IdleInhibitor()

    try:
        prepare_binary_stdio_for_windows()

        while True:
            message = read_message()
            if message is None:
                return 0

            send_message(handle_action(message, inhibitor))
    except Exception as error:  # noqa: BLE001
        send_message({"ok": False, "error": str(error)})
        return 1
    finally:
        inhibitor.stop()


if __name__ == "__main__":
    raise SystemExit(main())
