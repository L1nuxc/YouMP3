@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Install Node.js 22+ from https://nodejs.org
 pause
 exit /b 1
)
if not exist tools\yt-dlp.exe (
 echo Run setup.ps1 first: powershell -ExecutionPolicy Bypass -File setup.ps1
 pause
 exit /b 1
)
start "" http://127.0.0.1:3210
node server.mjs
pause
