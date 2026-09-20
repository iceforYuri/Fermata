# 真实 OS 级输入探测（DPI 感知版）：SetCursorPos + SendInput 点击
param([int]$X, [int]$Y)
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class NI {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] public static extern bool PhysicalToLogicalPointForPerMonitorDPI(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  public struct POINT { public int X; public int Y; }
}
"@
# 先声明 DPI 感知（任何 UI 调用之前）：坐标全部按物理像素
[void][NI]::SetProcessDpiAwarenessContext([IntPtr]::New(-4))  # PER_MONITOR_AWARE_V2
[void][NI]::SetProcessDPIAware()

[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($X, $Y)
Start-Sleep -Milliseconds 150
$pt = New-Object NI+POINT; $pt.X = $X; $pt.Y = $Y
$under = [NI]::WindowFromPoint($pt)
$upid = 0; [void][NI]::GetWindowThreadProcessId($under, [ref]$upid)
$ub = New-Object System.Text.StringBuilder 256; [void][NI]::GetWindowTextW($under, $ub, 256)
Write-Output "hover ($X,$Y) windowUnder pid=$upid title=$($ub.ToString())"
[NI]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 90
[NI]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
