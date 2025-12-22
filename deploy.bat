@echo off
echo ==========================================
echo      GITHUB PORTFOLIO DEPLOYER
echo ==========================================
echo.

REM 1. Set Repository URL (Hardcoded)
set REPO_URL=https://github.com/jervistuazon/jervistuazon.github.io.git

REM 2. Check/Initialize Git
if not exist .git (
    echo [INFO] Initializing Git...
    git init
    git remote add origin %REPO_URL%
) else (
    REM Ensure origin is set correctly
    git remote set-url origin %REPO_URL%
)

REM 3. Add and Commit
echo.
echo [INFO] Staging files...
git add .

echo [INFO] Committing changes...
git commit -m "Update portfolio content"

REM 4. Push to GitHub
echo.
echo [INFO] Pushing to GitHub...
git branch -M main
git push -u origin main

echo.
echo ==========================================
echo      UPLOAD COMPLETE!
echo ==========================================
echo.
echo Your changes are now live at: https://jervistuazon.github.io
echo.
pause
