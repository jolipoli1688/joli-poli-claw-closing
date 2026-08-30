@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Thin convenience launcher. The canonical implementation is npm run dev:cloud.
cd /d "%~dp0"
call npm.cmd run dev:cloud
exit /b %ERRORLEVEL%
