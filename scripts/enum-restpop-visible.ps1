Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WinEnum {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lp);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, System.Text.StringBuilder sb, int max);
  public delegate bool EnumProc(IntPtr h, IntPtr lp);
  public static List<string> Find(uint targetPid) {
    var list = new List<string>();
    EnumWindows((h, _) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != targetPid) return true;
      int len = GetWindowTextLength(h);
      if (len < 8) return true;
      var sb = new System.Text.StringBuilder(256);
      GetWindowText(h, sb, 256);
      string t = sb.ToString();
      if (t.StartsWith("Fermata ")) list.Add(string.Format("{0}|len={1}|visible={2}", h, len, IsWindowVisible(h)));
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@
$p = Get-Process fermata -ErrorAction SilentlyContinue
if ($p) { [WinEnum]::Find($p.Id) } else { Write-Output "no fermata process" }
