@echo off
echo ==========================================
echo      IMAGE OPTIMIZER (WebP) 
echo ==========================================
echo.
echo [STEP 1] Creating backup of assets...
xcopy assets assets_backup /E /I /Y
echo Backup created in "assets_backup" folder.
echo.

echo [STEP 2] Checking/Installing dependencies...
call npm install sharp
echo.

echo [STEP 3] Running conversion script...
node convert_to_webp.js

echo.
echo ==========================================
echo      OPTIMIZATION COMPLETE!
echo ==========================================
echo.
pause
