@echo off
echo ==========================================
echo      GITHUB PORTFOLIO DEPLOYER
echo ==========================================
echo.

REM 1. Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed on your computer.
    echo Please download and install it from: https://git-scm.com/download/win
    pause
    exit /b
)

REM 2. Initialize Git if needed
if not exist .git (
    echo [INFO] Initializing new Git repository...
    git init
)

REM 3. Check for Remote URL
git remote get-url origin >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo -----------------------------------------------------------
    echo STEP REQUIRED:
    echo 1. Go to https://github.com/new
    echo 2. Name your repository (e.g., 'my-portfolio')
    echo 3. Click 'Create repository'
    echo 4. Copy the HTTPS URL (it looks like: https://github.com/User/Repo.git)
    echo -----------------------------------------------------------
    echo.
    set /p repo_url="Paste the GitHub URL here and press Enter: "
    git remote add origin %repo_url%
)

REM 4. Add and Commit
echo.
echo [INFO] Adding files...
git add .

echo [INFO] Committing changes...
git commit -m "Update portfolio website"

REM 5. Push to GitHub
echo.
echo [INFO] Pushing to GitHub (Main Branch)...
git branch -M main
git push -u origin main

echo.
echo ==========================================
echo      UPLOAD COMPLETE!
echo ==========================================
echo.
echo FINAL STEP:
echo 1. Go to your Repository on GitHub.
echo 2. Click 'Settings' (top bar) -> 'Pages' (left sidebar).
echo 3. Under 'Build and deployment', set Branch to 'main' / '(root)'.
echo 4. Click 'Save'.
echo.
echo Your website will be live in 1-2 minutes!
echo.
pause
