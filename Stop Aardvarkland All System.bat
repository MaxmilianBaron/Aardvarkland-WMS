@echo off
setlocal
cd /d "%~dp0"
if "%AARDVARKLAND_DRY_RUN%"=="1" (
  echo Aardvarkland All System stopper ready.
  exit /b 0
)
echo Stopping Aardvarkland All System...
call "%~dp0frontend\Stop Frontend.bat"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-dev-service.ps1" -Port 0 -Label "queue worker" -ProjectDir "%~dp0backend" -Patterns "queue-worker.main"
call "%~dp0backend\Stop Backend.bat"
call "%~dp0backend\Stop Local Database.bat"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-dev-service.ps1" -Port 3002 -Label "local panel" -ProjectDir "%~dp0." -Patterns "launcher-dashboard.mjs"
echo Done.
