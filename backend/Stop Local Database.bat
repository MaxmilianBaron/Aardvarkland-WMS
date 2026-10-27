@echo off
setlocal
cd /d "%~dp0"
if "%AARDVARKLAND_DRY_RUN%"=="1" (
  echo Local database stopper ready.
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-local-postgres.ps1"
if errorlevel 1 goto failed
goto end
:failed
echo Local database stop failed.
pause
:end
