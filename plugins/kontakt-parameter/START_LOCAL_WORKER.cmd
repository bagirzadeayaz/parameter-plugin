@echo off
setlocal
cd /d "%~dp0\..\.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  pause
  exit /b 1
)

where codex >nul 2>nul
if errorlevel 1 (
  echo Codex CLI was not found. Open Codex Desktop or install Codex CLI first.
  pause
  exit /b 1
)

codex login status
if errorlevel 1 (
  echo Sign in to Codex first, then run this file again.
  pause
  exit /b 1
)

echo.
echo Starting the Kontakt search service. Keep this window open.
node plugins\kontakt-parameter\scripts\worker.mjs
echo.
echo The Kontakt search service stopped.
pause
