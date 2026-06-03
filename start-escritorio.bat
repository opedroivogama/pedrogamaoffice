@echo off
title Claude Office Visualizer
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-escritorio.ps1"
