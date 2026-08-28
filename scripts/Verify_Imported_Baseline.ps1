[CmdletBinding()]
param([string]$ExpectedVersion = '2.1.78')
$ErrorActionPreference = 'Stop'
$Script = Join-Path $PSScriptRoot 'verify_imported_baseline.py'
$py = Get-Command py -ErrorAction SilentlyContinue
if ($py) {
    & py -3 $Script --expected-version $ExpectedVersion
    exit $LASTEXITCODE
}
$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    & python $Script --expected-version $ExpectedVersion
    exit $LASTEXITCODE
}
throw 'Python was not found.'
