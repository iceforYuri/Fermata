# Inject activity (Ctrl tap + 1px mouse move) and VERIFY the idle timer actually reset (retry ×3)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Nudge {
  [StructLayout(LayoutKind.Sequential)] struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);
  public static uint IdleMs() {
    var lii = new LASTINPUTINFO(); lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    GetLastInputInfo(ref lii);
    return (uint)Environment.TickCount - lii.dwTime;
  }
  public static void Tap() {
    keybd_event(0x11, 0, 0, UIntPtr.Zero);
    keybd_event(0x11, 0, 2, UIntPtr.Zero);
    mouse_event(0x0001, 1, 0, 0, UIntPtr.Zero); // MOUSEEVENTF_MOVE +1px
    mouse_event(0x0001, -1, 0, 0, UIntPtr.Zero);
  }
}
"@
$ok = $false
for ($i = 0; $i -lt 12; $i++) {
  [Nudge]::Tap()
  Start-Sleep -Milliseconds 350
  if ([Nudge]::IdleMs() -lt 1500) { $ok = $true; break }
  Start-Sleep -Milliseconds 250
}
Write-Output "nudge ok=$ok idle=$([Nudge]::IdleMs())ms"
if (-not $ok) { exit 1 }
