@echo off
setlocal
cd /d "%~dp0"
if "%AARDVARKLAND_DRY_RUN%"=="1" (
  echo Backend launcher ready.
  exit /b 0
)
if not exist ".env" copy ".env.example" ".env" >nul
if not exist "node_modules" call npm ci
if errorlevel 1 goto failed
set "NODE_OPTIONS=--use-system-ca"
call npm run prisma:generate
if errorlevel 1 goto failed
call :ensure_database
if errorlevel 1 goto failed
call npm run prisma:deploy
if errorlevel 1 goto failed
:postgres_ready
if "%AARDVARKLAND_SKIP_BROWSER%"=="" start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process 'http://localhost:4001/api/health'"
call npm run start:dev
goto end
:ensure_database
node scripts/check-database-ready.mjs >nul 2>nul
if not errorlevel 1 exit /b 0
echo Starting local PostgreSQL on localhost:5432...
if "%AARDVARKLAND_BACKGROUND%"=="1" (
  start /b "" "%~dp0Start Local Database.bat"
) else (
  start "Aardvarkland Local Postgres 5432" "%~dp0Start Local Database.bat"
)
for /l %%i in (1,1,90) do (
  powershell -NoProfile -Command "Start-Sleep -Seconds 2" >nul
  node scripts/check-database-ready.mjs >nul 2>nul
  if not errorlevel 1 exit /b 0
)
echo Local PostgreSQL did not become ready in time.
exit /b 1
:failed
echo Spusteni backendu selhalo.
pause
:end
