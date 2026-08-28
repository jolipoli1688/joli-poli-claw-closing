@echo off
setlocal
cd /d "%~dp0.."
echo JOLI POLI Claw Closing - Web Migration Baseline Import
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Import_Current_Windows_App.ps1"
echo.
if errorlevel 1 (
  echo Import did not complete. Read the message above.
) else (
  echo Import completed successfully.
)
pause
