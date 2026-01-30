@echo off
echo ==========================================
echo      GITHUB PORTFOLIO DEPLOYER
echo ==========================================
echo.

REM 0. Generate Project Pages
echo [INFO] Generating SEO Project Pages...
call node generate-project-pages.js
if %errorlevel% neq 0 (
    echo [ERROR] Failed to generate project pages!
    pause
    exit /b %errorlevel%
)
)
echo.

REM 0a. Minify Assets (Auto-Build)
echo [INFO] Minifying assets (CSS/JS)...
call node build.js
if %errorlevel% neq 0 (
    echo [ERROR] Minification failed!
    pause
    exit /b %errorlevel%
)
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

REM 3. Pull from GitHub
echo.
echo [INFO] Pulling latest changes...
git pull origin main

REM 4. Add and Commit
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
