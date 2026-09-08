@echo off
setlocal
cd /d "%~dp0"
if "%AARDVARKLAND_DRY_RUN%"=="1" (
  echo Local database launcher ready.
  exit /b 0
)
if not exist ".env" copy ".env.example" ".env" >nul
if not exist "node_modules" call npm ci
if errorlevel 1 goto failed
node "%~dp0scripts\start-local-postgres.mjs"
if errorlevel 1 goto failed
goto end
:failed
echo Local database launcher failed.
pause
:end
