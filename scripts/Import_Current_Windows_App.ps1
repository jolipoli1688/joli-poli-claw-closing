[CmdletBinding()]
param(
    [string]$Source = 'D:\Python File\Claw_Closing_App',
    [string]$ExpectedVersion = '2.1.78',
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
$Script = Join-Path $PSScriptRoot 'import_current_windows_app.py'
$argsList = @($Script, '--source', $Source, '--expected-version', $ExpectedVersion)
if ($Force) { $argsList += '--force' }

$py = Get-Command py -ErrorAction SilentlyContinue
if ($py) {
    & py -3 @argsList
    exit $LASTEXITCODE
}
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    & python @argsList
    exit $LASTEXITCODE
}
throw 'Python was not found. The existing Claw Closing app normally includes/uses Python; run this from the same Windows machine or configure Python first.'
