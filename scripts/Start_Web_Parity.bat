@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
set "PARITY_PORT=4173"

if not exist "%PROJECT_ROOT%\local_backend\app.py" (
  echo ERROR: Local backend was not found at "%PROJECT_ROOT%\local_backend\app.py".
  exit /b 1
)

echo.
echo JOLI POLI Claw Closing browser parity shell
echo Starting local backend and browser UI: http://127.0.0.1:%PARITY_PORT%/
echo Development data: "%PROJECT_ROOT%\local_data"
echo.

start "JOLI POLI Local Backend" /b py -3 "%PROJECT_ROOT%\local_backend\app.py" --server --port %PARITY_PORT%
powershell -NoProfile -Command "Start-Sleep -Seconds 2"
start "" "http://127.0.0.1:%PARITY_PORT%/"
