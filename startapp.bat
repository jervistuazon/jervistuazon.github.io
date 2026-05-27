@echo off
setlocal

cd /d "%~dp0"

set "HOST=127.0.0.1"
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"

echo ==========================================
echo      LOCAL PORTFOLIO PREVIEW
echo ==========================================
echo.
echo Serving this folder:
echo %CD%
echo.
echo Local URL:
echo http://%HOST%:%PORT%/
echo.
echo Press Ctrl+C to stop the server.
echo.

where py >nul 2>nul
if %errorlevel% equ 0 (
    if /i not "%STARTAPP_NO_BROWSER%"=="1" start "" "http://%HOST%:%PORT%/"
    py -3 -m http.server %PORT% --bind %HOST%
    exit /b %errorlevel%
)

where python >nul 2>nul
if %errorlevel% equ 0 (
    if /i not "%STARTAPP_NO_BROWSER%"=="1" start "" "http://%HOST%:%PORT%/"
    python -m http.server %PORT% --bind %HOST%
    exit /b %errorlevel%
)

where node >nul 2>nul
if %errorlevel% equ 0 goto run_node

echo [ERROR] Python or Node.js was not found.
echo Install Python or Node.js, then run startapp.bat again.
echo You can also choose another port, for example:
echo startapp.bat 3000
echo.
pause
exit /b 1

:run_node
if /i not "%STARTAPP_NO_BROWSER%"=="1" start "" "http://%HOST%:%PORT%/"
node -e "const http=require('http'),fs=require('fs'),path=require('path'),url=require('url');const root=path.resolve(process.cwd());const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.ico':'image/x-icon','.mp4':'video/mp4','.txt':'text/plain; charset=utf-8'};http.createServer((req,res)=>{let pathname=decodeURIComponent(url.parse(req.url).pathname);if(pathname==='/'||pathname.endsWith('/'))pathname+='index.html';const file=path.resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}fs.stat(file,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream'});fs.createReadStream(file).pipe(res);});}).listen(Number(process.env.PORT||%PORT%),process.env.HOST||'%HOST%',()=>console.log('Server running at http://%HOST%:%PORT%/'));"
exit /b %errorlevel%
