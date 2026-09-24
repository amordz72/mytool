@echo off
setlocal EnableExtensions
title HiLink IP Manager - Update and Run
cd /d "%~dp0"

echo ==========================================
echo   HiLink IP Manager - UPDATE + RUN
echo ==========================================
echo.

if not exist "package.json" goto wrong_folder
where git >nul 2>&1 || goto git_missing
where node >nul 2>&1 || goto node_missing
where npm >nul 2>&1 || goto node_missing

echo [1/5] Checking GitHub...
git fetch origin main
if errorlevel 1 goto error

echo [2/5] Switching to main...
git switch main >nul 2>&1
if errorlevel 1 (
  git switch -c main --track origin/main
  if errorlevel 1 goto local_changes
)

for /f %%i in ('git rev-parse HEAD') do set "BEFORE=%%i"

echo [3/5] Pulling latest version...
git pull --ff-only origin main
if errorlevel 1 goto local_changes

for /f %%i in ('git rev-parse HEAD') do set "AFTER=%%i"

echo [4/5] Checking dependencies...
if not exist "node_modules" (
  call npm ci
  if errorlevel 1 goto error
) else (
  if not "%BEFORE%"=="%AFTER%" (
    git diff --quiet "%BEFORE%" "%AFTER%" -- package-lock.json
    if errorlevel 1 (
      call npm ci
      if errorlevel 1 goto error
    )
  )
)

echo [5/5] Starting HiLink IP Manager...
echo.
call npm run dev
if errorlevel 1 goto error

exit /b 0

:wrong_folder
echo ERROR: Put this BAT file inside the hilink-ip-manager project folder.
pause
exit /b 1

:git_missing
echo ERROR: Git is not installed or not available in PATH.
pause
exit /b 1

:node_missing
echo ERROR: Node.js/npm is not installed or not available in PATH.
pause
exit /b 1

:local_changes
echo.
echo UPDATE STOPPED SAFELY.
echo Git could not switch/pull because the project has local changes or a branch conflict.
echo Nothing was deleted. Send a screenshot of this window for review.
pause
exit /b 1

:error
echo.
echo ERROR: Update or launch failed.
echo Send a screenshot of this window for review.
pause
exit /b 1
