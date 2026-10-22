@echo off
rem battlemap remote access - setup (run on the Windows PC at the table's house)
rem
rem Double-click it. It asks for admin rights, then:
rem   1. installs Tailscale (a private VPN) if it isn't there,
rem   2. signs this PC in to Konrad's Tailscale network (a key from Konrad, or a login link
rem      you send him),
rem   3. lets Konrad's Mac reach exactly two devices here: the TV box and the tablet
rem      (nothing else on this network),
rem   4. optionally keeps the PC awake while it is plugged in,
rem   5. optionally lets Konrad log in to this PC as administrator (SSH), only through the tunnel.
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
# Konrad's Mac key for step 5 (admin login over SSH).
$KonradKey = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQCro76fzR2fFZRuRIkcuAklKJHWLjU+tGPDLYowxhoQLNQ9r3bCaOzB3XzDaDbpeLfAy2UeHdUZgcaI1v4BmTduOSCqDXvKqcCsnx8MjjxcZA26pv7eGnBP02E5n0VyZi/0ckYAiSmlEOBW6I2dxbMqyo2/5Kj1PV701bs3D5z8EXLe3dkz9gflSqPi9MyIbcluzgk1yYNimWC+XrwtcXqZGk31SATXQvNBZQ6m+ws4wyukQ+UpCkuUgWtObcS3toFVvz9wWOBudNAH6K+35pANhB2hOt+V5t/Jj5sbjbSGcBxEEptzA/PiipESwbhnJRLFog5XtCSJrunlYhgnpTNmzcKeaCdSuO2QcxUlrbp2RBKEdeYIO/I0GlEJnYw/E10ToYHQ8X/DZ87cBvTXvsoe0EaGZsbJS33hkl9kJFieKsPySrpJv8GJfxqJmGB4OgvJcNXWQ4xzCXZBRop4Ch2aGuuDhPGdVNvaZ0ZhrszLflarCNIYwmW5kOdcqquV5647rBsa3f0Jx1iMaTaQKN+zaKsokjZQrJDdqNjrK8QdysjXthHJWcFtPtZ4XATNetMxr7VTSNRi118yvhdoK1P7cNoFXNzADg8OCn/8o4oBPkjlRNHGUpbs+BVtsyag7kxOCdvRLKBvMrJiuR2A9MwKS85MEGC2ebxTz+f7AXHtNQ== konrad-battlemap-remote'
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
  Step '1/5  Tailscale'
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
  Step '2/5  TV box and tablet on this network'
  foreach ($ip in $Devices.Keys) {
    $tcp = New-Object Net.Sockets.TcpClient
    $ok = $false
    try { $ok = $tcp.ConnectAsync($ip, 5555).Wait(1500) -and $tcp.Connected } catch { } finally { $tcp.Close() }
    if ($ok) { Say ("  {0,-16} {1}: reachable" -f $ip, $Devices[$ip]) 'Green' }
    else     { Say ("  {0,-16} {1}: not answering (switched off, asleep, or another address) - fine for now, Konrad can check later" -f $ip, $Devices[$ip]) 'Yellow' }
  }

  # --- 3. Sign in and share the two devices --------------------------------------------------
  Step '3/5  Sign in to Konrad''s Tailscale network'
  if ($status.BackendState -eq 'Running' -and $status.Self.HostName -eq 'battlemap-table') {
    Say 'Already set up - refreshing the shared devices.' 'Green'
    & $ts set --advertise-routes=$Routes | Out-Host
  } elseif ($status.BackendState -eq 'Running') {
    $me = $status.User."$($status.Self.UserID)".LoginName
    Say "Tailscale is already signed in here as: $me" 'Yellow'
    if (-not (Ask 'Share the TV box and the tablet through this account?' $false)) {
      throw 'Stopped - nothing changed. Tell Konrad Tailscale is already in use on this PC; he will send another way.'
    }
    & $ts set --advertise-routes=$Routes --hostname=battlemap-table | Out-Host
  } else {
    Say 'Konrad either sent you a key (starts with tskey-), or you send him a login link.'
    Say 'Tailscale may also open its own window and a sign-in page in the browser: do NOT sign in there.' 'Yellow'
    Say 'The address of that browser page is the same login link - sending Konrad that works too.' 'Yellow'
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
      for ($i = 0; $i -lt 120 -and -not $url -and -not $p.HasExited; $i++) {
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
        Say ''
        Say '  No link showed up here. Copy the address of the Tailscale page in your browser' 'White'
        Say '  (click the address bar, Ctrl+C) and send that to Konrad - it is the same link.' 'White'
        Say '  Waiting until he has signed in... (leave this window open)'
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
  Step '4/5  Keep the PC awake while plugged in'
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

  # --- 5. Admin login for Konrad ---------------------------------------------------------------
  Step '5/5  Let Konrad log in to this PC (optional)'
  Say 'Konrad can then log in to this PC as administrator over the tunnel - to run AI models on'
  Say 'the graphics card and fix things without a call. He can do anything on the PC while it is on.'
  Say 'Only through Tailscale, not from your home network. battlemap-remote-remove.cmd takes it back.'
  if (Ask 'Allow Konrad admin access to this PC?' $false) {
    $cap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*' | Select-Object -First 1
    if (-not $cap) { throw 'This Windows has no SSH server to install. Send Konrad a photo of this window.' }
    if ($cap.State -ne 'Installed') {
      Say 'Installing the Windows SSH server (can take a few minutes)...'
      Add-WindowsCapability -Online -Name $cap.Name | Out-Null
      Set-Content -Path (Join-Path $State 'ssh-installed.txt') -Value 'installed by battlemap-remote-setup'
      # Windows opens port 22 to the whole home network; we only want the tunnel.
      Disable-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue
    }
    Set-Service sshd -StartupType Automatic
    Start-Service sshd
    $keys = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
    if (-not ((Test-Path $keys) -and (Select-String -Path $keys -SimpleMatch $KonradKey -Quiet))) {
      Add-Content -Path $keys -Value $KonradKey -Encoding ascii
    }
    # Only Administrators and SYSTEM (by SID, so German Windows works too), or sshd ignores the file.
    icacls $keys /inheritance:r /grant '*S-1-5-32-544:F' /grant '*S-1-5-18:F' | Out-Null
    if (-not (Get-NetFirewallRule -Name 'battlemap-remote-ssh' -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -Name 'battlemap-remote-ssh' -DisplayName 'battlemap remote: SSH through Tailscale' `
        -Direction Inbound -Protocol TCP -LocalPort 22 -RemoteAddress 100.64.0.0/10 -Action Allow | Out-Null
    }
    Say "Done. Konrad logs in as '$env:USERNAME'." 'Green'
  } else {
    Say 'Left as it is.'
  }

  Write-Host ''
  Say 'All set - thank you! Tell Konrad it worked (a photo of this window is perfect).' 'Green'
} catch {
  Write-Host ''
  Say "Problem: $($_.Exception.Message)" 'Red'
}
