Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinEnum {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder sb, int max);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
$targets = @((Get-Process gika -ErrorAction SilentlyContinue).Id)
if ($targets.Count -eq 0) { Write-Output "no gika process"; exit }
$script:lines = New-Object System.Collections.ArrayList
$cb = [WinEnum+EnumProc]{ param($h,$l)
  [uint32]$pid2 = 0; [WinEnum]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
  if ($targets -contains $pid2) {
    $t = New-Object Text.StringBuilder 256; [WinEnum]::GetWindowText($h, $t, 256) | Out-Null
    $c = New-Object Text.StringBuilder 256; [WinEnum]::GetClassName($h, $c, 256) | Out-Null
    $r = New-Object WinEnum+RECT; [WinEnum]::GetWindowRect($h, [ref]$r) | Out-Null
    $v = [WinEnum]::IsWindowVisible($h)
    [void]$script:lines.Add(("{0} | {1} | {2} | rect={3},{4}-{5},{6} | vis={7}" -f $h, $t, $c, $r.Left, $r.Top, $r.Right, $r.Bottom, $v))
  }
  return $true
}
[WinEnum]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
$script:lines | ForEach-Object { Write-Output $_ }
