"""Per-session terminal window tracking and focusing.

The hook reports the PID of the Claude Code (node) process on session_start.
At focus time we walk up the live process tree, checking each ancestor for a
visible top-level window. The first ancestor that owns one is the terminal
(typically wt.exe / WindowsTerminal.exe / VSCode / Cursor — note that
powershell.exe and cmd.exe do not own their own windows; conhost or the
terminal app does).

The mapping is in-memory only; restarting the backend clears it.

Only Windows performs an actual focus. On other platforms ``focus_session``
returns False.
"""

from __future__ import annotations

import logging
import sys

logger = logging.getLogger(__name__)

# session_id -> claude_code_pid (the PID reported on session_start)
_session_claude_pid: dict[str, int] = {}


def register_session(session_id: str, claude_code_pid: int) -> None:
    """Record the Claude Code process PID for a session."""
    if not session_id or not claude_code_pid:
        return
    _session_claude_pid[session_id] = claude_code_pid
    logger.info(
        "Registered claude_code_pid=%s for session %s",
        claude_code_pid,
        session_id,
    )


def get_terminal_pid(session_id: str) -> int | None:
    """Return the registered Claude Code PID for *session_id*, or None."""
    return _session_claude_pid.get(session_id)


def focus_session(session_id: str) -> bool:
    """Bring this session's terminal window to the foreground.

    Walks up the process tree from the registered Claude Code PID, picking
    the first ancestor that has a visible window.

    Returns:
        True on success. False if not registered, not Windows, the chain
        died, or no ancestor owns a window we can focus.
    """
    pid = _session_claude_pid.get(session_id)
    if pid is None:
        logger.debug("focus_session: no PID for %s", session_id)
        return False
    if sys.platform != "win32":
        return False
    return _focus_ancestor_with_window(pid)


# ---------------------------------------------------------------------------
# Windows implementation
# ---------------------------------------------------------------------------

if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes

    class _PROCESSENTRY32(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ProcessID", wintypes.DWORD),
            ("th32DefaultHeapID", ctypes.c_void_p),
            ("th32ModuleID", wintypes.DWORD),
            ("cntThreads", wintypes.DWORD),
            ("th32ParentProcessID", wintypes.DWORD),
            ("pcPriClassBase", ctypes.c_long),
            ("dwFlags", wintypes.DWORD),
            ("szExeFile", ctypes.c_char * 260),
        ]

    _TH32CS_SNAPPROCESS = 0x00000002
    _SW_RESTORE = 9
    _INVALID_HANDLE_VALUE = -1

    _kernel32 = ctypes.windll.kernel32
    _user32 = ctypes.windll.user32

    _kernel32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    _kernel32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    _kernel32.Process32First.argtypes = [wintypes.HANDLE, ctypes.POINTER(_PROCESSENTRY32)]
    _kernel32.Process32Next.argtypes = [wintypes.HANDLE, ctypes.POINTER(_PROCESSENTRY32)]
    _kernel32.CloseHandle.argtypes = [wintypes.HANDLE]

    _user32.EnumWindows.argtypes = [ctypes.c_void_p, wintypes.LPARAM]
    _user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    _user32.IsWindowVisible.argtypes = [wintypes.HWND]
    _user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    _user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    _user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    _user32.AllowSetForegroundWindow.argtypes = [wintypes.DWORD]

    def _snapshot_processes() -> dict[int, tuple[int, str]]:
        """Snapshot the live process table: {pid: (ppid, exe_name_lower)}."""
        result: dict[int, tuple[int, str]] = {}
        snapshot = _kernel32.CreateToolhelp32Snapshot(_TH32CS_SNAPPROCESS, 0)
        if snapshot in (0, _INVALID_HANDLE_VALUE):
            return result
        try:
            entry = _PROCESSENTRY32()
            entry.dwSize = ctypes.sizeof(_PROCESSENTRY32)
            if not _kernel32.Process32First(snapshot, ctypes.byref(entry)):
                return result
            while True:
                name = entry.szExeFile.decode("utf-8", errors="ignore").lower()
                result[int(entry.th32ProcessID)] = (int(entry.th32ParentProcessID), name)
                if not _kernel32.Process32Next(snapshot, ctypes.byref(entry)):
                    break
        finally:
            _kernel32.CloseHandle(snapshot)
        return result

    def _pids_with_visible_windows() -> dict[int, int]:
        """Return {pid: hwnd} for processes that own at least one visible
        top-level window with a non-empty title (best window per pid).
        """
        result: dict[int, int] = {}

        @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        def _enum(hwnd: int, _lparam: int) -> bool:
            if not _user32.IsWindowVisible(hwnd):
                return True
            if _user32.GetWindowTextLengthW(hwnd) == 0:
                return True
            win_pid = wintypes.DWORD()
            _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(win_pid))
            pid = int(win_pid.value)
            if pid and pid not in result:
                result[pid] = int(hwnd)
            return True

        try:
            _user32.EnumWindows(_enum, 0)
        except Exception:
            logger.exception("EnumWindows failed")
        return result

    def _focus_ancestor_with_window(start_pid: int, max_depth: int = 12) -> bool:
        """Walk up from start_pid; focus the first ancestor's window."""
        proc_table = _snapshot_processes()
        windows = _pids_with_visible_windows()

        pid = start_pid
        seen: set[int] = set()
        chain: list[int] = []
        for _ in range(max_depth):
            if pid <= 0 or pid in seen:
                break
            seen.add(pid)
            chain.append(pid)
            if pid in windows:
                hwnd = windows[pid]
                try:
                    _user32.AllowSetForegroundWindow(pid)
                    _user32.ShowWindow(hwnd, _SW_RESTORE)
                    ok = bool(_user32.SetForegroundWindow(hwnd))
                    logger.info(
                        "focus chain=%s -> pid=%s hwnd=%s ok=%s",
                        chain,
                        pid,
                        hwnd,
                        ok,
                    )
                    return ok
                except Exception:
                    logger.exception("Focus failed for pid=%s hwnd=%s", pid, hwnd)
                    return False
            info = proc_table.get(pid)
            if info is None:
                break
            pid = info[0]  # parent PID

        logger.info(
            "No ancestor with window for start_pid=%s (chain=%s)", start_pid, chain
        )
        return False

else:

    def _focus_ancestor_with_window(start_pid: int, max_depth: int = 12) -> bool:  # noqa: ARG001
        return False
