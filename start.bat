@echo off
REM Double-click wrapper for start.ps1 (so Windows doesn't open it in Notepad)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
