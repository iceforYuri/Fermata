param([int]$X, [int]$Y)
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class SW2 {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
}
"@
[void][SW2]::SetProcessDpiAwarenessContext([IntPtr]::New(-4))
[void][SW2]::SetCursorPos($X, $Y)
Start-Sleep -Milliseconds 80
$pos = [System.Windows.Forms.Cursor]::Position
[SW2]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 80
[SW2]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "actual=($($pos.X),$($pos.Y))"
