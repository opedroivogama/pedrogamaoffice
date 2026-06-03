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


async def warm_pid_cache_from_db() -> None:
    """Populate the in-memory PID map from persisted SessionRecord rows.

    Called on backend startup so the focus action keeps working across
    restarts for sessions whose terminal process is still alive. Stale
    entries (dead PIDs) are harmless — the focus walk simply fails.
    """
    from sqlalchemy import select

    from app.db.database import AsyncSessionLocal
    from app.db.models import SessionRecord

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(SessionRecord.id, SessionRecord.terminal_pid).where(
                SessionRecord.terminal_pid.is_not(None)
            )
        )
        loaded = 0
        for sid, pid in result.all():
            if sid and pid:
                _session_claude_pid[sid] = int(pid)
                loaded += 1
        logger.info("Warmed terminal-PID cache: %d session(s)", loaded)


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
    _SW_MINIMIZE = 6
    _SW_SHOW = 5
    _SW_SHOWNORMAL = 1
    _INVALID_HANDLE_VALUE = -1
    _HWND_TOP = 0
    _HWND_TOPMOST = -1
    _HWND_NOTOPMOST = -2
    _SWP_NOMOVE = 0x0002
    _SWP_NOSIZE = 0x0001
    _SWP_SHOWWINDOW = 0x0040

    _kernel32 = ctypes.windll.kernel32
    _user32 = ctypes.windll.user32

    _VK_MENU = 0x12  # Alt
    _KEYEVENTF_KEYUP = 0x0002

    _user32.keybd_event.argtypes = [
        wintypes.BYTE,
        wintypes.BYTE,
        wintypes.DWORD,
        ctypes.c_void_p,
    ]

    _kernel32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    _kernel32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    _kernel32.Process32First.argtypes = [wintypes.HANDLE, ctypes.POINTER(_PROCESSENTRY32)]
    _kernel32.Process32Next.argtypes = [wintypes.HANDLE, ctypes.POINTER(_PROCESSENTRY32)]
    _kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    _kernel32.GetCurrentThreadId.restype = wintypes.DWORD

    _user32.EnumWindows.argtypes = [ctypes.c_void_p, wintypes.LPARAM]
    _user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    _user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    _user32.IsWindowVisible.argtypes = [wintypes.HWND]
    _user32.IsIconic.argtypes = [wintypes.HWND]
    _user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    _user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    _user32.GetForegroundWindow.restype = wintypes.HWND
    _user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    _user32.AllowSetForegroundWindow.argtypes = [wintypes.DWORD]
    _user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
    _user32.BringWindowToTop.argtypes = [wintypes.HWND]
    _user32.SetWindowPos.argtypes = [
        wintypes.HWND,
        wintypes.HWND,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.UINT,
    ]
    _user32.SwitchToThisWindow.argtypes = [wintypes.HWND, wintypes.BOOL]

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

    def _force_foreground(hwnd: int, pid: int) -> bool:
        """Best-effort bring *hwnd* to the foreground on Windows.

        SetForegroundWindow is blocked unless the caller is itself foreground
        or has had recent user input. The backend (Python) doesn't qualify
        when triggered from a browser click, so we layer several tricks:

        1. AllowSetForegroundWindow on the target pid (in case Windows checks).
        2. If minimized, ShowWindow(RESTORE); otherwise force a quick
           MINIMIZE→RESTORE cycle, which counts as user-driven and sidesteps
           the foreground lock.
        3. AttachThreadInput to the current foreground thread so our call
           is treated as coming from the same input queue.
        4. BringWindowToTop + SetWindowPos(TOPMOST→NOTOPMOST) to also raise
           Z-order even if focus is denied — this is the bit that makes the
           window visually overlap the browser/office tab.
        5. SwitchToThisWindow as a final fallback (semi-documented but
           more permissive than SetForegroundWindow).
        """
        _user32.AllowSetForegroundWindow(pid)

        if _user32.IsIconic(hwnd):
            _user32.ShowWindow(hwnd, _SW_RESTORE)

        # Fake an Alt keypress so Windows treats this call as user-driven and
        # releases the foreground lock for the next SetForegroundWindow.
        # Down + Up so no modifier stays stuck.
        _user32.keybd_event(_VK_MENU, 0, 0, None)
        _user32.keybd_event(_VK_MENU, 0, _KEYEVENTF_KEYUP, None)

        _user32.SetWindowPos(
            hwnd,
            _HWND_TOPMOST,
            0,
            0,
            0,
            0,
            _SWP_NOMOVE | _SWP_NOSIZE | _SWP_SHOWWINDOW,
        )
        _user32.SetWindowPos(
            hwnd,
            _HWND_NOTOPMOST,
            0,
            0,
            0,
            0,
            _SWP_NOMOVE | _SWP_NOSIZE | _SWP_SHOWWINDOW,
        )
        _user32.BringWindowToTop(hwnd)

        fg_hwnd = _user32.GetForegroundWindow()
        fg_thread = _user32.GetWindowThreadProcessId(fg_hwnd, None) if fg_hwnd else 0
        our_thread = _kernel32.GetCurrentThreadId()

        attached = False
        if fg_thread and fg_thread != our_thread:
            attached = bool(_user32.AttachThreadInput(our_thread, fg_thread, True))

        try:
            ok = bool(_user32.SetForegroundWindow(hwnd))
        finally:
            if attached:
                _user32.AttachThreadInput(our_thread, fg_thread, False)

        if not ok:
            try:
                _user32.SwitchToThisWindow(hwnd, True)
                ok = True
            except Exception:
                logger.debug("SwitchToThisWindow fallback failed", exc_info=True)

        return ok

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
                    ok = _force_foreground(hwnd, pid)
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

        logger.info("No ancestor with window for start_pid=%s (chain=%s)", start_pid, chain)
        return False

else:

    def _focus_ancestor_with_window(start_pid: int, max_depth: int = 12) -> bool:  # noqa: ARG001
        return False
