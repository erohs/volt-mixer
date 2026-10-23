# Prints the Volt's vendor HID interface capabilities as JSON (read-only; opens the device with no access rights).
$src = @'
using System; using System.Runtime.InteropServices; using Microsoft.Win32.SafeHandles;
public static class VoltHid {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern SafeFileHandle CreateFile(string n, uint a, uint s, IntPtr sa, uint c, uint f, IntPtr t);
  [DllImport("hid.dll")] public static extern bool HidD_GetPreparsedData(SafeFileHandle h, out IntPtr p);
  [DllImport("hid.dll")] public static extern int HidP_GetCaps(IntPtr p, out CAPS c);
  [DllImport("hid.dll")] public static extern bool HidD_FreePreparsedData(IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct CAPS {
    public ushort Usage, UsagePage, InLen, OutLen, FeatLen;
    [MarshalAs(UnmanagedType.ByValArray, SizeConst=17)] public ushort[] R;
    public ushort NLinkColl, NInBtn, NInVal, NInData, NOutBtn, NOutVal, NOutData, NFeatBtn, NFeatVal, NFeatData;
  }
}
'@
Add-Type $src
$results = @()
foreach ($d in Get-PnpDevice -PresentOnly -Class HIDClass | Where-Object { $_.InstanceId -match '^HID\\VID_2B5A' }) {
    $path = '\\?\' + ($d.InstanceId -replace '\\', '#') + '#{4d1e55b2-f16f-11cf-88cb-001111000030}'
    $h = [VoltHid]::CreateFile($path, 0, 3, [IntPtr]::Zero, 3, 0, [IntPtr]::Zero)
    if ($h.IsInvalid) { continue }
    $p = [IntPtr]::Zero; [void][VoltHid]::HidD_GetPreparsedData($h, [ref]$p)
    $c = New-Object VoltHid+CAPS; [void][VoltHid]::HidP_GetCaps($p, [ref]$c)
    [void][VoltHid]::HidD_FreePreparsedData($p); $h.Close()
    $results += [ordered]@{
        instanceId = $d.InstanceId; usagePage = ('0x{0:X4}' -f $c.UsagePage); usage = ('0x{0:X4}' -f $c.Usage)
        inputReportBytes = $c.InLen; outputReportBytes = $c.OutLen; featureReportBytes = $c.FeatLen
        linkCollections = $c.NLinkColl; inputValueCaps = $c.NInVal; outputValueCaps = $c.NOutVal
    }
}
ConvertTo-Json -InputObject @($results) -Depth 3
