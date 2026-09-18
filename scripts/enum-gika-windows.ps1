# List visible windows whose title contains gika, with rects, and sample corner pixels
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinRect {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
$procs = Get-Process | Where-Object { $_.MainWindowTitle -like "*gika*" }
foreach ($p in $procs) {
  $r = New-Object WinRect+RECT
  [WinRect]::GetWindowRect($p.MainWindowHandle, [ref]$r) | Out-Null
  $vis = [WinRect]::IsWindowVisible($p.MainWindowHandle)
  Write-Output ("{0} | title={1} | rect={2},{3}-{4},{5} | visible={6}" -f $p.ProcessName, $p.MainWindowTitle, $r.Left, $r.Top, $r.Right, $r.Bottom, $vis)
}
if (-not $procs) { Write-Output "no gika windows found via MainWindowTitle" }
