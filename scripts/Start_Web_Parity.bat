@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."
set "WEB_ROOT=%PROJECT_ROOT%\web"
set "PARITY_PORT=4173"

if not exist "%WEB_ROOT%\index.html" (
  echo ERROR: Browser parity shell was not found at "%WEB_ROOT%".
  exit /b 1
)

echo.
echo JOLI POLI Claw Closing browser parity shell
echo Serving: http://127.0.0.1:%PARITY_PORT%/
echo Press Ctrl+C to stop the local server.
echo.

py -3 -m http.server %PARITY_PORT% --bind 127.0.0.1 --directory "%WEB_ROOT%"
if errorlevel 1 (
  echo.
  echo ERROR: Could not start the local parity server. Confirm Python is installed and port %PARITY_PORT% is available.
  exit /b 1
)
