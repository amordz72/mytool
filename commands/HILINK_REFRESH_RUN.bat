@echo off
setlocal EnableExtensions EnableDelayedExpansion
title HiLink IP Manager - Refresh + Run
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$p=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); if($p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){exit 0}else{exit 1}" >nul 2>&1
if errorlevel 1 (
  echo Requesting Administrator permission...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ==========================================
echo   HiLink IP Manager - REFRESH + RUN
echo ==========================================
echo.

if not exist "package.json" goto wrong_folder
where git >nul 2>&1 || goto git_missing
where node >nul 2>&1 || goto node_missing
where npm >nul 2>&1 || goto node_missing

set "FETCH_OK=0"
for /L %%R in (1,1,3) do (
  echo [1/5] Fetching latest main... attempt %%R/3
  git fetch origin main
  if not errorlevel 1 (
    set "FETCH_OK=1"
    goto fetch_done
  )
  if %%R LSS 3 (
    echo GitHub is not reachable yet. Retrying in 5 seconds...
    timeout /t 5 /nobreak >nul
  )
)

:fetch_done
if "%FETCH_OK%"=="0" goto github_offline

echo [2/5] Switching to main...
git switch main >nul 2>&1
if errorlevel 1 (
  git switch -c main --track origin/main
  if errorlevel 1 goto local_changes
)

for /f %%i in ('git rev-parse HEAD') do set "BEFORE=%%i"

echo [3/5] Updating project...
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

:github_offline
echo.
echo WARNING: Could not connect to github.com:443.
echo The update was NOT downloaded.
echo.
if not exist "node_modules" (
  echo The local app cannot start because dependencies are not installed.
  echo Restore Internet access, then run this file again.
  pause
  exit /b 1
)
echo Starting the CURRENT LOCAL VERSION so you can keep working offline.
echo Run this file again when Internet/GitHub access returns to get the update.
echo.
call npm run dev
if errorlevel 1 goto error
exit /b 0

:wrong_folder
echo ERROR: Put this file inside the hilink-ip-manager folder.
pause
exit /b 1

:git_missing
echo ERROR: Git is missing from PATH.
pause
exit /b 1

:node_missing
echo ERROR: Node.js/npm is missing from PATH.
pause
exit /b 1

:local_changes
echo.
echo UPDATE STOPPED SAFELY.
echo Local changes or a branch conflict prevented the update.
echo Nothing was deleted. Send a photo of this window.
pause
exit /b 1

:error
echo.
echo ERROR: Refresh or launch failed.
echo Send a photo of this window.
pause
exit /b 1
