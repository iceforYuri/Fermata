# What is the NSIS installer doing: list its child processes and any visible windows
$setup = Get-Process -Name "gika_1.0.0_x64-setup" -ErrorAction SilentlyContinue
if (-not $setup) { Write-Output "installer not running"; exit }
Write-Output "installer pid: $($setup.Id), threads: $($setup.Threads.Count), cpu: $($setup.CPU)"
$cim = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $setup.Id }
foreach ($c in $cim) { Write-Output "child: $($c.Name) pid=$($c.ProcessId) cmd=$($c.CommandLine)" }
# visible windows of the process tree
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinVis {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$pidSetup = $setup.Id
$cb = [WinVis+EnumProc]{
  param($h, $l)
  $procId = 0
  [WinVis]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
  if ($procId -eq $pidSetup -and [WinVis]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 256
    [WinVis]::GetWindowTextW($h, $sb, 256) | Out-Null
    Write-Output ("window: '{0}' hwnd={1}" -f $sb.ToString(), $h)
  }
  return $true
}
[WinVis]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
Write-Output "done"
