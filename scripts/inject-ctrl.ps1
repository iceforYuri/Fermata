# Inject lone Ctrl press (harmless) to reset the system idle timer
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KeyCtrl {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
[KeyCtrl]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
[KeyCtrl]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
Write-Output "ctrl nudged"
