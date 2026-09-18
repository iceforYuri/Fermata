# Probe: does injection reset GetLastInputInfo right now?
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class IdleProbe {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public static uint IdleMs() {
    var lii = new LASTINPUTINFO(); lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    GetLastInputInfo(ref lii);
    return (uint)Environment.TickCount - lii.dwTime;
  }
}
"@
$before = [IdleProbe]::IdleMs()
[IdleProbe]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
[IdleProbe]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 400
$after = [IdleProbe]::IdleMs()
Write-Output "idle before=${before}ms after=${after}ms"
