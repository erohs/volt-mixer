# The administrator part of run-capture.ps1, which starts it: runs USBPcapCMD on the root hub(s)
# carrying the Volt, recording only the Volt's own device address when USBPcap lists it (so not
# the keyboard or mouse on the same hub), writes usbpcap-<stamp>.started, and stops the capture
# when run-capture.ps1 writes usbpcap-<stamp>.stop or exits. Log: captures\usbpcap-<stamp>.txt
param([Parameter(Mandatory)][string]$Captures, [Parameter(Mandatory)][string]$Stamp, [Parameter(Mandatory)][int]$ParentId)

$ErrorActionPreference = 'Stop'
$usbpcap = 'C:\Program Files\USBPcap\USBPcapCMD.exe'
$base = Join-Path $Captures "usbpcap-$Stamp"
$voltPattern = 'Volt|Universal Audio|2B5A'
Start-Transcript -Path "$base.txt" | Out-Null

function Get-Hubs {
    & $usbpcap --extcap-interfaces | Select-String -Pattern 'value=(\\\\\.\\USBPcap\d+)' |
        ForEach-Object { $_.Matches[0].Groups[1].Value } | Sort-Object -Unique
}

# --extcap-config lists each attached device as "value {arg=N}{value=<address>}{display=...}", and
# its interfaces as "<address>_<n>"; the Volt's lines name it.
function Get-VoltAddresses([string[]]$config) {
    $config | Where-Object { $_ -match $voltPattern } |
        ForEach-Object { if ($_ -match '\{value=(\d+)') { $Matches[1] } } | Sort-Object -Unique
}

function Start-HubCapture([string]$hub, [string[]]$addresses) {
    $out = Join-Path $Captures ("volt-$Stamp-" + ($hub -replace '.*USBPcap', 'hub') + '.pcap')
    $filter = if ($addresses) { "--devices $($addresses -join ',') --inject-descriptors" } else { '-A' }
    Write-Host "Capturing on $hub with $filter"
    Start-Process -FilePath $usbpcap -ArgumentList "-d `"$hub`" -o `"$out`" $filter -s 65535" -PassThru -WindowStyle Hidden
}

function Start-Captures {
    $hubs = @(Get-Hubs)
    if (-not $hubs) { throw 'No USBPcap interfaces found. Reboot after installing USBPcap, then try again.' }
    $voltHubs = @{}
    foreach ($hub in $hubs) {
        $config = @(& $usbpcap --extcap-interface $hub --extcap-config)
        if ($config -match $voltPattern) { $voltHubs[$hub] = @(Get-VoltAddresses $config) }
    }
    if (-not $voltHubs.Count) {
        Write-Host 'Volt not identified on a specific hub; capturing every device on all hubs.'
        foreach ($hub in $hubs) { $voltHubs[$hub] = @() }
    }
    foreach ($hub in $voltHubs.Keys) { Start-HubCapture $hub $voltHubs[$hub] }
}

$procs = @()
try {
    $procs = @(Start-Captures)
    Start-Sleep -Seconds 2
    "Capturing on: $(($procs | ForEach-Object { $_.Id }) -join ', ') (USBPcapCMD process IDs)" | Set-Content "$base.started"
    while (-not (Test-Path "$base.stop") -and (Get-Process -Id $ParentId -ErrorAction SilentlyContinue)) {
        Start-Sleep -Milliseconds 250
    }
}
finally {
    foreach ($p in $procs) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force } }
    Stop-Transcript | Out-Null
}
