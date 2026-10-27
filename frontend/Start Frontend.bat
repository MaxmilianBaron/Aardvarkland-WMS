@echo off
setlocal
cd /d "%~dp0"
if "%AARDVARKLAND_DRY_RUN%"=="1" (
  echo Frontend launcher ready.
  exit /b 0
)
if not exist ".env" copy ".env.example" ".env" >nul
if not exist "node_modules" call npm ci
if errorlevel 1 goto failed
if "%AARDVARKLAND_SKIP_BROWSER%"=="" start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0..\scripts\open-url-when-ready.ps1" -Url "http://localhost:4000" -TimeoutSeconds 120
call npm run dev
goto end
:failed
echo Spusteni frontendu selhalo.
pause
:end
