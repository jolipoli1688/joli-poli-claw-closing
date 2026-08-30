@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem CLOUD STAGING launcher: reads only the browser-safe publishable key.
rem It never reads .env.staging.local or any service-role credential.
set "ROOT=%~dp0"
set "CONFIG=%ROOT%.env.cloud-staging.local"
set "CLAW_SUPABASE_URL=https://fbvzqdqjqcbjopuinknw.supabase.co"
set "CLAW_SUPABASE_PUBLISHABLE_KEY="
set "LOG=%TEMP%\JOLI_POLI_Claw_Staging.log"
set "CLOUD_URL=http://localhost:3001/"

if not exist "%CONFIG%" goto :missing_config
findstr /R /I /C:"^SUPABASE_SERVICE_ROLE_KEY=" /C:"^SUPABASE_SECRET_KEY=" "%CONFIG%" >nul && goto :unsafe_config

for /f "usebackq tokens=1,* delims==" %%A in ("%CONFIG%") do (
  if /I "%%A"=="CLAW_SUPABASE_PUBLISHABLE_KEY" set "CLAW_SUPABASE_PUBLISHABLE_KEY=%%B"
)

if not defined CLAW_SUPABASE_PUBLISHABLE_KEY goto :missing_key
python --version >nul 2>&1 || goto :missing_python

powershell -NoProfile -Command "$listener=Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -First 1; if($listener){$process=Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue; $name=if($process){$process.ProcessName}else{'unknown'}; Write-Host ('CLOUD STAGING was not started: port 3001 is already in use by ' + $name + ' (PID ' + $listener.OwningProcess + ').'); exit 1}"
if errorlevel 1 exit /b 1

start "" /b python "%ROOT%scripts\Start_Cloud_Staging.py" > "%LOG%" 2>&1
powershell -NoProfile -Command "$ready=$false; 1..40 | ForEach-Object { try { $r=Invoke-WebRequest -UseBasicParsing 'http://localhost:3001/'; if($r.StatusCode -eq 200 -and $r.Content -match 'fbvzqdqjqcbjopuinknw'){ $ready=$true; break } } catch {}; Start-Sleep -Milliseconds 250 }; if(-not $ready){exit 1}" >nul 2>&1
if errorlevel 1 goto :not_ready

start "" "%CLOUD_URL%"
exit /b 0

:missing_config
echo CLOUD STAGING was not started.
echo Copy .env.cloud-staging.example to .env.cloud-staging.local and set the browser-safe publishable key.
exit /b 1

:unsafe_config
echo CLOUD STAGING was not started because the browser config contains a server-only key name.
exit /b 1

:missing_key
echo CLOUD STAGING was not started because CLAW_SUPABASE_PUBLISHABLE_KEY is blank.
exit /b 1

:missing_python
echo CLOUD STAGING was not started because Python is not available on PATH.
exit /b 1

:not_ready
echo CLOUD STAGING did not become ready at http://localhost:3001/.
echo See %LOG% for host diagnostics.
exit /b 1
