@echo off
setlocal
set "PORT=4000"
set "LABEL=frontend"
set "PROJECT_DIR=%~dp0."
if "%AARDVARKLAND_DRY_RUN%"=="1" (
  echo Frontend stopper ready.
  exit /b 0
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\scripts\stop-dev-service.ps1" -Port %PORT% -Label "%LABEL%" -ProjectDir "%PROJECT_DIR%" -Patterns "Start Frontend.bat" "vite.js" "npm run dev" "node_modules\@vitejs" "node_modules\@esbuild"
if errorlevel 1 goto failed
goto end
:failed
echo Frontend stop failed.
pause
:end
