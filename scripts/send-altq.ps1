Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class KeyInject {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
"@
# VK_MENU=0x12, VK_Q=0x51, KEYEVENTF_KEYUP=0x0002
[KeyInject]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[KeyInject]::keybd_event(0x51, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[KeyInject]::keybd_event(0x51, 0, 2, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[KeyInject]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
Write-Output "alt+q injected"
