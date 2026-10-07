@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install it before presenting offline, then run start.bat again.
  pause
  exit /b 1
)
node serve.cjs --open
pause
