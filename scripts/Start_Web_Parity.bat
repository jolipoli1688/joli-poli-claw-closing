@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
set "PARITY_PORT=4173"
set "CLAW_RUNTIME_MODE=local"
set "CLAW_LOCAL_DATA_MODE=uat"
set "CLAW_LOCAL_DATA_DIR=%PROJECT_ROOT%\local_data\uat"
set "CLAW_SUPABASE_URL="
set "CLAW_SUPABASE_PUBLISHABLE_KEY="
set "SUPABASE_SERVICE_ROLE_KEY="
set "SUPABASE_SECRET_KEY="

if not exist "%PROJECT_ROOT%\local_backend\app.py" (
  echo ERROR: Local backend was not found at "%PROJECT_ROOT%\local_backend\app.py".
  exit /b 1
)

if not exist "%CLAW_LOCAL_DATA_DIR%\claw_machine_database.xlsx" (
  echo ERROR: Normal UAT data was not found at "%CLAW_LOCAL_DATA_DIR%\claw_machine_database.xlsx".
  echo Restore a project-owned copied UAT workbook before starting this launcher.
  exit /b 1
)

echo.
echo JOLI POLI Claw Closing browser parity shell
echo Starting local backend and browser UI: http://127.0.0.1:%PARITY_PORT%/
echo Normal UAT data: "%CLAW_LOCAL_DATA_DIR%"
echo.

start "JOLI POLI Local Backend" /b py -3 "%PROJECT_ROOT%\local_backend\app.py" --server --port %PARITY_PORT%
powershell -NoProfile -Command "Start-Sleep -Seconds 2"
start "" "http://127.0.0.1:%PARITY_PORT%/"
