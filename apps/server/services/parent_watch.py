"""The backend ends itself when the app that started it is gone.

If the desktop app crashes or is ended hard (Task Manager, an update installing), its normal clean-up does not run and
the backend kept running with its AI workers (ACE-Step, MIDI-DDSP, ...): they used the processor and memory, the next
start had to use another port, and playback in the Studio crackled. The app passes its process id in AMS_PARENT_PID;
every few seconds this checks that it is still there, and if not, ends the backend and everything it started.
"""
import os
import subprocess
import sys
import threading
import time


def _alive(pid: int) -> bool:
    if sys.platform == "win32":
        import ctypes
        SYNCHRONIZE, WAIT_TIMEOUT = 0x00100000, 0x00000102
        h = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE, False, pid)
        if not h:
            return False
        try:
            return ctypes.windll.kernel32.WaitForSingleObject(h, 0) == WAIT_TIMEOUT
        finally:
            ctypes.windll.kernel32.CloseHandle(h)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def _end_everything() -> None:
    print("[watch] the app is gone: ending the backend and its workers", flush=True)
    if sys.platform == "win32":
        # /T: also the workers this process started (they do not end with their parent on Windows)
        subprocess.run(["taskkill", "/PID", str(os.getpid()), "/T", "/F"], capture_output=True,
                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    else:
        try:
            subprocess.run(["pkill", "-KILL", "-P", str(os.getpid())], capture_output=True)   # the workers it started
        except Exception:  # noqa: BLE001 - no pkill: end this process at least
            pass
    os._exit(0)


def start(interval: float = 3.0) -> None:
    raw = os.environ.get("AMS_PARENT_PID", "")
    if not raw.isdigit():
        return
    pid = int(raw)

    def loop() -> None:
        while True:
            time.sleep(interval)
            if not _alive(pid):
                _end_everything()
    threading.Thread(target=loop, name="parent-watch", daemon=True).start()
