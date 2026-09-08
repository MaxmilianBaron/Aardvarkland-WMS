@echo off
setlocal
set "PORT=4001"
set "LABEL=backend"
set "PROJECT_DIR=%~dp0."
if "%AARDVARKLAND_DRY_RUN%"=="1" (
  echo Backend stopper ready.
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\stop-dev-service.ps1" -Port %PORT% -Label "%LABEL%" -ProjectDir "%PROJECT_DIR%" -Patterns "Start Backend.bat" "@nestjs" "dist\main" "dist/main" "npm run start:dev"
if errorlevel 1 goto failed
goto end
:failed
echo Backend stop failed.
pause
:end
