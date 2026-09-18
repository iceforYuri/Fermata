Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KeyInject2 {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
# VK_CONTROL=0x11, VK_SHIFT=0x10, VK_K=0x4B
[KeyInject2]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero)
[KeyInject2]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[KeyInject2]::keybd_event(0x4B, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[KeyInject2]::keybd_event(0x4B, 0, 2, [UIntPtr]::Zero)
[KeyInject2]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero)
[KeyInject2]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
Write-Output "ctrl+shift+k injected"
