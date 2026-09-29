Set-Location -Path 'C:\Users\sdhanw\RCASalesforce\CML-UAT'
$logDir = 'C:\Users\sdhanw\RCASalesforce\CML-UAT\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir ("cml-refresh-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd_HHmmss'))
# Redirect via cmd.exe (not PowerShell's `2>&1`) so sf CLI's stderr warnings
# don't get wrapped as terminating PowerShell ErrorRecords.
cmd.exe /c "node scripts\cml-daily-refresh.js > `"$logFile`" 2>&1"
exit $LASTEXITCODE
