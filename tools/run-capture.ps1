# Records the Volt's USB traffic during a capture: the automated sweep (capture-run.js), UAD Console
# starting up (-Mode startup) or user-paced front-panel prompts (-Mode manual, -From N to resume).
# Only USBPcap runs as administrator (usbpcap.ps1, one prompt); node and UAD Console run as you.
# Output: captures\volt-<timestamp>-<hub>.pcap + run-log.jsonl
param([string]$Mode = 'auto', [int]$From = 1, [string]$Phases = '')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$captures = Join-Path $root 'captures'
New-Item -ItemType Directory -Force $captures | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$recorderBase = Join-Path $captures "usbpcap-$stamp"
Start-Transcript -Path (Join-Path $captures "run-capture-$stamp.txt") | Out-Null

# Waits for the elevated recorder to say it's capturing (after the admin prompt), or to fail.
function Start-Recorder {
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\usbpcap.ps1`" " +
        "-Captures `"$captures`" -Stamp $stamp -ParentId $PID"
    $recorder = Start-Process powershell -Verb RunAs -PassThru -WindowStyle Hidden -ArgumentList $arguments
    while (-not (Test-Path "$recorderBase.started")) {
        if ($recorder.HasExited) { throw "USBPcap didn't start; see $recorderBase.txt" }
        Start-Sleep -Milliseconds 250
    }
    Get-Content "$recorderBase.started" | Write-Host
    $recorder
}

function Stop-Recorder($recorder) {
    New-Item -ItemType File -Force "$recorderBase.stop" | Out-Null
    $recorder.WaitForExit()
    Remove-Item "$recorderBase.started", "$recorderBase.stop" -ErrorAction SilentlyContinue
}

# Capture UAD Console's start-up: the handshake and the full state it pushes to the Volt.
function Invoke-Startup {
    $log = Join-Path $captures "startup-log-$stamp.jsonl"
    $mark = { param($phase) Add-Content $log ('{"t":' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() + ',"phase":"' + $phase + '"}') }
    & $mark 'idle'
    Start-Sleep -Seconds 5
    & $mark 'console-launch'
    Start-Process "C:\Program Files (x86)\Universal Audio\UAD Console\UAD Console.exe"
    Start-Sleep -Seconds 45
    & $mark 'settled'
    Start-Sleep -Seconds 10
}

$recorder = $null
Push-Location $PSScriptRoot
try {
    if ($Mode -eq 'startup') {
        # Quit UA's mixer software first, so the capture sees it start from scratch.
        Get-Process 'UAD Console', 'UAMixerHelper' -ErrorAction SilentlyContinue | Stop-Process -Force
        Start-Sleep -Seconds 3
    }
    $recorder = Start-Recorder
    if ($Mode -eq 'startup') { Invoke-Startup }
    elseif ($Mode -eq 'manual') { node manual-prompts.js $From }
    else {
        $env:MSYS_NO_PATHCONV = '1'
        if ($Phases) { $env:CAPTURE_PHASES = $Phases }
        node capture-run.js
        if ($LASTEXITCODE) { Write-Host 'capture-run.js reported a problem: check the messages above.' -ForegroundColor Red }
    }
}
finally {
    Pop-Location
    if ($recorder) { Stop-Recorder $recorder }
    Stop-Transcript | Out-Null
}
