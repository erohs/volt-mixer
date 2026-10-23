# Starts USBPcap on the root hub(s) carrying the Volt, runs capture-run.js, then stops the capture.
# Self-elevates (USBPcap needs admin). Output: captures\volt-<timestamp>-<hub>.pcap + run-log.jsonl
param([switch]$Elevated, [string]$Mode = 'auto', [int]$From = 1, [string]$Phases = '')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$captures = Join-Path $root 'captures'
$usbpcap = 'C:\Program Files\USBPcap\USBPcapCMD.exe'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Elevated -Mode $Mode -From $From -Phases `"$Phases`""
    exit
}

New-Item -ItemType Directory -Force $captures | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$transcript = Join-Path $captures "run-capture-$stamp.txt"
Start-Transcript -Path $transcript | Out-Null

try {
    if ($Mode -eq 'startup') {
        # Quit UA's mixer software first, so the capture sees it start from scratch.
        Get-Process 'UAD Console', 'UAMixerHelper' -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 3
    }

    # Find USBPcap root hubs; prefer the one whose attached-device list mentions the Volt.
    $ifaces = & $usbpcap --extcap-interfaces | Select-String -Pattern 'value=(\\\\\.\\USBPcap\d+)' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Sort-Object -Unique
    if (-not $ifaces) { throw 'No USBPcap interfaces found. Reboot after installing USBPcap, then try again.' }
    $voltIfaces = @()
    foreach ($i in $ifaces) {
        $cfg = (& $usbpcap --extcap-interface $i --extcap-config) -join "`n"
        if ($cfg -match 'Volt|Universal Audio|2B5A') { $voltIfaces += $i }
    }
    if (-not $voltIfaces) { Write-Host 'Volt not identified on a specific hub; capturing all hubs.'; $voltIfaces = $ifaces }
    Write-Host "Capturing on: $($voltIfaces -join ', ')"

    $procs = @()
    foreach ($i in $voltIfaces) {
        $n = ($i -replace '.*USBPcap', 'hub')
        $out = Join-Path $captures "volt-$stamp-$n.pcap"
        $procs += Start-Process -FilePath $usbpcap -ArgumentList "-d `"$i`" -o `"$out`" -A -s 65535" -PassThru -WindowStyle Hidden
    }
    Start-Sleep -Seconds 2

    if ($Mode -eq 'startup') {
        # Capture UAD Console's start-up: the handshake and the full state it pushes to the Volt.
        # Launched via explorer so Console runs as the normal user, not elevated.
        $log = Join-Path $captures "startup-log-$stamp.jsonl"
        $mark = { param($phase) Add-Content $log ('{"t":' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + ',"phase":"' + $phase + '"}') }
        & $mark 'idle'
        Start-Sleep -Seconds 5
        & $mark 'console-launch'
        Start-Process explorer.exe -ArgumentList "`"C:\Program Files (x86)\Universal Audio\UAD Console\UAD Console.exe`""
        Start-Sleep -Seconds 45
        & $mark 'settled'
        Start-Sleep -Seconds 10
    } elseif ($Mode -eq 'manual') {
        Push-Location $PSScriptRoot
        node manual-prompts.js $From
        Pop-Location
    } else {
        Push-Location $PSScriptRoot
        $env:MSYS_NO_PATHCONV = '1'
        if ($Phases) { $env:CAPTURE_PHASES = $Phases }
        node capture-run.js
        Pop-Location
    }
}
finally {
    foreach ($p in $procs) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force } }
    Stop-Transcript | Out-Null
}
