@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js or add it to PATH.
  pause
  exit /b 1
)
node "%~dp0scripts\serve-local.mjs"
