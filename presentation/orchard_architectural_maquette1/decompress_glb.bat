@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ===================================================
echo   glTF / GLB Meshopt Decompressor
echo ===================================================

if "%~1"=="" (
    if not exist "model.glb" (
        echo [ERROR] No input file specified and model.glb not found in current folder.
        echo Drag and drop a .glb or .gltf file onto this script.
        pause
        exit /b 1
    )
    set "INPUT=model.glb"
    set "OUTPUT=model_decompressed.glb"
) else (
    set "INPUT=%~1"
    set "OUTPUT=%~dpn1_decompressed.glb"
)

echo Input : "!INPUT!"
echo Output: "!OUTPUT!"
echo.
echo Decompressing meshopt bufferViews using gltf-transform...
gltf-transform copy "!INPUT!" "!OUTPUT!"

if !errorlevel! equ 0 (
    echo.
    echo [SUCCESS] Decompressed file saved to: "!OUTPUT!"
    echo You can now import this file directly into Blender!
) else (
    echo.
    echo [FAILED] Decompression encountered an error.
)

echo.
pause
