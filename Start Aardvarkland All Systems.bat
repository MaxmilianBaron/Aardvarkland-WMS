@echo off
setlocal
if "%AARDVARKLAND_DRY_RUN%"=="1" (
  echo Aardvarkland All Systems launcher ready.
  exit /b 0
)
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\start-aardvarkland-system.ps1"
