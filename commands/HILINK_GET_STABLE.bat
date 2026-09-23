@echo off
setlocal EnableExtensions
title HiLink IP Manager - Get Stable
cd /d "%~dp0"
set "BRANCH=stable-v0.5-main-sync"

echo ==========================================
echo   HiLink IP Manager - Stable Update
echo ==========================================

where git >nul 2>&1 || goto git_missing

git fetch origin --prune
if errorlevel 1 goto error
git reset --hard
if errorlevel 1 goto error
git clean -fdx -e "HILINK_GET_STABLE.bat"
if errorlevel 1 goto error
git checkout -B %BRANCH% origin/%BRANCH%
if errorlevel 1 goto error
git reset --hard origin/%BRANCH%
if errorlevel 1 goto error

echo.
echo OK - STABLE VERSION READY
pause
exit /b 0

:git_missing
echo ERROR: Git is not installed or not available in PATH.
pause
exit /b 1

:error
echo ERROR - Update failed
pause
exit /b 1
