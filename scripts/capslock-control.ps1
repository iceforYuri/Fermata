# CapsLock toggle control: inject CapsLock press, check OS toggle state change
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CapsProbe {
  [DllImport("user32.dll")] public static extern short GetKeyState(int nVirtKey);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
$before = [CapsProbe]::GetKeyState(0x14) -band 1
[CapsProbe]::keybd_event(0x14, 0, 0, [UIntPtr]::Zero)
[CapsProbe]::keybd_event(0x14, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 300
$after = [CapsProbe]::GetKeyState(0x14) -band 1
Write-Output "capslock before=$before after=$after"
if ($before -ne $after) { Write-Output "INJECTION REACHES OS INPUT" } else { Write-Output "INJECTION SWALLOWED" }
