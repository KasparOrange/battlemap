@echo off
rem battlemap remote access - setup (run on the Windows PC at the table's house)
rem
rem Double-click it. It asks for admin rights, then:
rem   1. installs Tailscale (a private VPN) if it isn't there,
rem   2. signs this PC in to Konrad's Tailscale network (a key from Konrad, or a login link
rem      you send him),
rem   3. lets Konrad's Mac reach exactly two devices here: the TV box and the tablet
rem      (nothing else on this network),
rem   4. optionally keeps the PC awake while it is plugged in.
rem Run it again any time to see the status. Undo everything: battlemap-remote-remove.cmd
rem
rem The rest of this file is PowerShell; the lines below hand it over.
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
$ErrorActionPreference = 'Stop'

# The two devices Konrad's Mac may reach (adb on port 5555). Change here if their addresses
# change (better: give them fixed addresses in the router, see the message).
$Devices = [ordered]@{ '192.168.178.149' = 'Xiaomi TV box'; '192.168.178.199' = 'Konrad''s tablet' }
$Routes  = ($Devices.Keys | ForEach-Object { "$_/32" }) -join ','
$State   = Join-Path $env:ProgramData 'battlemap-remote'
New-Item -ItemType Directory -Force -Path $State | Out-Null

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Step($text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }
function Ask($question, $default) {
  $hint = if ($default) { '[Y/n]' } else { '[y/N]' }
  $a = Read-Host "$question $hint"
  if ([string]::IsNullOrWhiteSpace($a)) { return $default }
  return $a.Trim().ToLower().StartsWith('y')
}

try {
  Say 'battlemap remote access - setup' 'White'

  # --- 1. Tailscale ------------------------------------------------------------------------
  Step '1/4  Tailscale'
  $ts = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
  if (Test-Path $ts) {
    Say 'Already installed.' 'Green'
  } else {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
      Say 'Installing with winget...'
      winget install --id Tailscale.Tailscale -e --silent --accept-source-agreements --accept-package-agreements | Out-Host
    }
    if (-not (Test-Path $ts)) {
      $arch = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'amd64' }
      $msi = Join-Path $env:TEMP "tailscale-setup-$arch.msi"
      Say "Downloading the installer from tailscale.com ($arch)..."
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      Invoke-WebRequest "https://pkgs.tailscale.com/stable/tailscale-setup-latest-$arch.msi" -OutFile $msi -UseBasicParsing
      Say 'Installing...'
      Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /norestart" -Wait
    }
    if (-not (Test-Path $ts)) { throw 'Tailscale did not install. Send Konrad a photo of this window.' }
    Say 'Installed.' 'Green'
  }
  # Wait for the Tailscale service to answer.
  $status = $null
  for ($i = 0; $i -lt 30 -and -not $status; $i++) {
    try { $status = (& $ts status --json 2>$null | Out-String | ConvertFrom-Json) } catch { }
    if (-not $status) { Start-Sleep 2 }
  }
  if (-not $status) { throw 'The Tailscale service does not answer. Restart the PC and run this again.' }

  # --- 2. The two devices ------------------------------------------------------------------
  Step '2/4  TV box and tablet on this network'
  foreach ($ip in $Devices.Keys) {
    $tcp = New-Object Net.Sockets.TcpClient
    $ok = $false
    try { $ok = $tcp.ConnectAsync($ip, 5555).Wait(1500) -and $tcp.Connected } catch { } finally { $tcp.Close() }
    if ($ok) { Say ("  {0,-16} {1}: reachable" -f $ip, $Devices[$ip]) 'Green' }
    else     { Say ("  {0,-16} {1}: not answering (switched off, asleep, or another address) - fine for now, Konrad can check later" -f $ip, $Devices[$ip]) 'Yellow' }
  }

  # --- 3. Sign in and share the two devices --------------------------------------------------
  Step '3/4  Sign in to Konrad''s Tailscale network'
  if ($status.BackendState -eq 'Running' -and $status.Self.HostName -eq 'battlemap-table') {
    Say 'Already set up - refreshing the shared devices.' 'Green'
    & $ts set --advertise-routes=$Routes | Out-Host
  } elseif ($status.BackendState -eq 'Running') {
    $me = $status.User."$($status.Self.UserID)".LoginName
    Say "Tailscale is already signed in here as: $me" 'Yellow'
    if (-not (Ask 'Share the TV box and the tablet through this account?' $false)) {
      throw 'Stopped - nothing changed. Tell Konrad Tailscale is already in use on this PC; he will send another way.'
    }
    & $ts set --advertise-routes=$Routes | Out-Host
  } else {
    Say 'Konrad either sent you a key (starts with tskey-), or you send him a login link.'
    $key = (Read-Host 'Paste the key, or just press Enter for a login link').Trim()
    $common = @('up', '--unattended', "--advertise-routes=$Routes", '--accept-routes=false', '--accept-dns=false',
                '--hostname=battlemap-table')
    if ($key) {
      & $ts @common "--auth-key=$key" | Out-Host
    } else {
      $out = Join-Path $State 'login-out.txt'; $err = Join-Path $State 'login-err.txt'
      Remove-Item $out, $err -ErrorAction SilentlyContinue
      $p = Start-Process -FilePath $ts -ArgumentList $common -NoNewWindow -PassThru `
             -RedirectStandardOutput $out -RedirectStandardError $err
      $url = $null
      for ($i = 0; $i -lt 60 -and -not $url -and -not $p.HasExited; $i++) {
        Start-Sleep 1
        $text = (Get-Content $out, $err -Raw -ErrorAction SilentlyContinue) -join "`n"
        if ($text -match '(https://login\.tailscale\.com/\S+)') { $url = $Matches[1] }
      }
      if ($url) {
        Set-Clipboard -Value $url
        Say ''
        Say '  Send Konrad this link (it is already copied - just paste it into Telegram):' 'White'
        Say "  $url" 'Magenta'
        Say ''
        Say '  Waiting until he has signed in... (leave this window open)'
        $p.WaitForExit()
      } elseif (-not $p.HasExited) {
        $p.WaitForExit()
      }
      Get-Content $out, $err -ErrorAction SilentlyContinue | Out-Host
    }
  }
  $status = (& $ts status --json | Out-String | ConvertFrom-Json)
  if ($status.BackendState -ne 'Running') { throw "Tailscale is not connected (state: $($status.BackendState)). Send Konrad a photo of this window." }
  Say "Connected. This PC is '$($status.Self.HostName)', $($status.Self.TailscaleIPs[0])." 'Green'
  Say "Shared: $Routes (Konrad approves them once on his side)."

  # --- 4. Stay awake -------------------------------------------------------------------------
  Step '4/4  Keep the PC awake while plugged in'
  Say 'Konrad can only reach the TV box while this PC is on and awake.'
  if (Ask 'Never sleep while plugged in? (the screen still turns off)' $true) {
    $backup = Join-Path $State 'sleep-backup.txt'
    if (-not (Test-Path $backup)) {
      $lines = @()
      foreach ($pair in @(@('STANDBYIDLE', 'standby-timeout-ac'), @('HIBERNATEIDLE', 'hibernate-timeout-ac'))) {
        # Language-proof: the last two hex numbers are the current AC and DC values (seconds).
        $hex = [regex]::Matches((powercfg /q SCHEME_CURRENT SUB_SLEEP $pair[0] | Out-String), '0x([0-9a-fA-F]{8})')
        if ($hex.Count -ge 2) {
          $seconds = [Convert]::ToInt32($hex[$hex.Count - 2].Groups[1].Value, 16)
          $lines += "$($pair[1])=$([Math]::Floor($seconds / 60))"
        }
      }
      Set-Content -Path $backup -Value $lines
    }
    powercfg /change standby-timeout-ac 0
    powercfg /change hibernate-timeout-ac 0
    Say 'Done. battlemap-remote-remove.cmd puts the old sleep settings back.' 'Green'
  } else {
    Say 'Left as it is.'
  }

  Write-Host ''
  Say 'All set - thank you! Tell Konrad it worked (a photo of this window is perfect).' 'Green'
} catch {
  Write-Host ''
  Say "Problem: $($_.Exception.Message)" 'Red'
}
