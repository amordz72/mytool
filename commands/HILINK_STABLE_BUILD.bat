@echo off
setlocal EnableExtensions
title HiLink IP Manager - Stable Update + Build
cd /d "%~dp0"

set "BRANCH=stable-v0.5-main-sync"

echo ==========================================
echo   HiLink IP Manager - STABLE + BUILD
echo ==========================================
echo.
echo WARNING: local uncommitted project changes will be removed.
echo.

where git >nul 2>&1 || goto git_missing
where node >nul 2>&1 || goto node_missing
where npm >nul 2>&1 || goto node_missing

echo [1/6] Fetching GitHub...
git fetch origin --prune
if errorlevel 1 goto error

echo [2/6] Resetting old tracked files...
git reset --hard
if errorlevel 1 goto error

echo [3/6] Removing old/untracked files...
git clean -fdx -e "HILINK_STABLE_BUILD.bat"
if errorlevel 1 goto error

echo [4/6] Switching to stable...
git checkout -B %BRANCH% origin/%BRANCH%
if errorlevel 1 goto error
git reset --hard origin/%BRANCH%
if errorlevel 1 goto error

echo [5/6] Installing exact dependencies...
call npm ci
if errorlevel 1 goto error

echo [6/6] Building Windows Setup + Portable...
call npm run build -- --publish never
if errorlevel 1 goto error

echo.
echo ==========================================
echo   DONE - BUILD COMPLETE
echo ==========================================
echo.
start "" "%cd%\release"
pause
exit /b 0

:git_missing
echo ERROR: Git is not installed or not available in PATH.
pause
exit /b 1

:node_missing
echo ERROR: Node.js/npm is not installed or not available in PATH.
pause
exit /b 1

:error
echo.
echo ==========================================
echo   ERROR - Operation failed
echo ==========================================
pause
exit /b 1
