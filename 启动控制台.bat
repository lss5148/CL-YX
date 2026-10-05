@echo off
rem Game Console One-Click Launcher
title Game Console Launcher
cd /d "%~dp0"
echo ==========================================
echo   Game Console Launcher
echo   Repo: %~dp0
echo   Open after start: http://localhost:9000
echo   Stop: Ctrl+C in this window
echo ==========================================
node scripts\one_click.js %*
echo.
pause
