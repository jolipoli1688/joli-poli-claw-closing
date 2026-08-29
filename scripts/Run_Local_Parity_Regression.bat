@echo off
setlocal

set "PROJECT_ROOT=%~dp0.."

if not exist "%PROJECT_ROOT%\local_backend\app.py" (
  echo ERROR: Local backend was not found at "%PROJECT_ROOT%\local_backend\app.py".
  exit /b 1
)

node "%PROJECT_ROOT%\scripts\Run_Local_Parity_Harness.mjs"
exit /b %ERRORLEVEL%
