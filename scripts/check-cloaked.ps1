Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class DwmChk {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder sb, int max);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int attr, out int val, int size);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int idx);
}
'@
$targets = @((Get-Process gika -ErrorAction SilentlyContinue).Id)
$script:lines = New-Object System.Collections.ArrayList
$cb = [DwmChk+EnumProc]{ param($h,$l)
  [uint32]$pid2 = 0; [DwmChk]::GetWindowThreadProcessId($h, [ref]$pid2) | Out-Null
  if ($targets -contains $pid2) {
    $t = New-Object Text.StringBuilder 256; [DwmChk]::GetWindowText($h, $t, 256) | Out-Null
    [int]$cloaked = -1; [DwmChk]::DwmGetWindowAttribute($h, 14, [ref]$cloaked, 4) | Out-Null  # DWMWA_CLOAKED=14
    $ex = [DwmChk]::GetWindowLong($h, -20)  # GWL_EXSTYLE
    [void]$script:lines.Add(("{0} | {1} | cloaked={2} | exstyle=0x{3}" -f $h, $t, $cloaked, $ex.ToString('X8')))
  }
  return $true
}
[DwmChk]::EnumWindows($cb, [IntPtr]::Zero) | Out-Null
$script:lines | ForEach-Object { Write-Output $_ }
