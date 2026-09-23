@echo off
setlocal
title HiLink IP Manager - Build Windows
cd /d "%~dp0"

where node >nul 2>&1 || goto node_missing
where npm >nul 2>&1 || goto node_missing

call npm ci
if errorlevel 1 goto error
call npm run build -- --publish never
if errorlevel 1 goto error

echo.
echo BUILD COMPLETE
start "" "%cd%\release"
pause
exit /b 0

:node_missing
echo ERROR: Node.js/npm is not installed or not available in PATH.
pause
exit /b 1

:error
echo ERROR - Build failed
pause
exit /b 1
