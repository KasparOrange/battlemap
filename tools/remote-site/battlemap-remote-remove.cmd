@echo off
rem battlemap remote access - remove (undo battlemap-remote-setup.cmd)
rem
rem Double-click it. It asks for admin rights, then:
rem   1. stops sharing the TV box and the tablet and signs this PC out of Konrad's network,
rem   2. takes back Konrad's admin login (SSH) if it was allowed,
rem   3. puts the PC's old sleep settings back,
rem   4. optionally uninstalls Tailscale.
setlocal
set "BM_SELF=%~f0"
fltmc >nul 2>&1 || (
  echo Asking for admin rights...
  powershell -NoProfile -Command "Start-Process -FilePath $env:BM_SELF -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText($env:BM_SELF); $m='#'+'POWERSHELL'; iex $s.Substring($s.IndexOf($m))"
echo.
pause
exit /b

#POWERSHELL
$ErrorActionPreference = 'Continue'
$ts    = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
$State = Join-Path $env:ProgramData 'battlemap-remote'

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }

Say 'battlemap remote access - remove' 'White'

if (Test-Path $ts) {
  & $ts set --advertise-routes= 2>$null | Out-Null
  & $ts logout | Out-Host
  Say 'Signed out - Konrad can no longer reach anything here.' 'Green'
} else {
  Say 'Tailscale is not installed.'
}

$keys = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
if (Test-Path $keys) {
  $rest = @(Get-Content $keys | Where-Object { $_ -notmatch 'konrad-battlemap-remote$' })
  if ($rest.Count) { Set-Content -Path $keys -Value $rest -Encoding ascii } else { Remove-Item $keys -Force }
}
Remove-NetFirewallRule -Name 'battlemap-remote-ssh' -ErrorAction SilentlyContinue
if (Test-Path (Join-Path $State 'ssh-installed.txt')) {
  Stop-Service sshd -ErrorAction SilentlyContinue
  $cap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*' | Select-Object -First 1
  if ($cap) { Remove-WindowsCapability -Online -Name $cap.Name | Out-Null }
}
Say 'Konrad''s admin login removed.' 'Green'

$backup = Join-Path $State 'sleep-backup.txt'
if (Test-Path $backup) {
  foreach ($line in Get-Content $backup) {
    $name, $minutes = $line -split '='
    powercfg /change $name $minutes
  }
  Say 'Sleep settings restored.' 'Green'
}
Remove-Item $State -Recurse -Force -ErrorAction SilentlyContinue

if ((Test-Path $ts) -and ((Read-Host 'Uninstall Tailscale too? [y/N]').Trim().ToLower().StartsWith('y'))) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget uninstall --id Tailscale.Tailscale -e --silent | Out-Host
  }
  if (Test-Path $ts) {
    $app = Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' |
           Where-Object { $_.DisplayName -like 'Tailscale*' } | Select-Object -First 1
    if ($app -and $app.PSChildName -match '^\{') {
      Start-Process msiexec.exe -ArgumentList "/x $($app.PSChildName) /quiet /norestart" -Wait
    }
  }
  if (Test-Path $ts) { Say 'Could not uninstall - remove "Tailscale" under Settings > Apps.' 'Yellow' }
  else { Say 'Tailscale uninstalled.' 'Green' }
}

Write-Host ''
Say 'Done.' 'Green'
