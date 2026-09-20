# Focus Fermata window, then inject plain key 'A' (VK 0x41) via keybd_event
$w = New-Object -ComObject wscript.shell
$ok = $w.AppActivate("Fermata")
Write-Output "AppActivate(Fermata) = $ok"
Start-Sleep -Milliseconds 600
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KeyA {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
[KeyA]::keybd_event(0x41, 0, 0, [UIntPtr]::Zero)
[KeyA]::keybd_event(0x41, 0, 2, [UIntPtr]::Zero)
Write-Output "key A injected"
