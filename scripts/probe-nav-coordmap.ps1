# 坐标映射直接测量：窗口矩形/客户区/物理→逻辑转换
Add-Type @"
using System; using System.Runtime.InteropServices;
public class CM {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool PhysicalToLogicalPointForPerMonitorDPI(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetDC(IntPtr h);
  [DllImport("gdi32.dll")] public static extern int GetDeviceCaps(IntPtr dc, int i);
  [DllImport("user32.dll")] public static extern int ReleaseDC(IntPtr h, IntPtr dc);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public struct POINT { public int X, int Y; }
}
"@
[void][CM]::SetProcessDpiAwarenessContext([IntPtr]::New(-4))
$p = Get-Process fermata | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$h = $p.MainWindowHandle
$wr = New-Object CM+RECT; [void][CM]::GetWindowRect($h, [ref]$wr)
$cr = New-Object CM+RECT; [void][CM]::GetClientRect($h, [ref]$cr)
$pt = New-Object CM+POINT; $pt.X = 0; $pt.Y = 0; [void][CM]::ClientToScreen($h, [ref]$pt)
$dc = [CM]::GetDC($h); $logpix = [CM]::GetDeviceCaps($dc, 88); [void][CM]::ReleaseDC($h, $dc)
Write-Output "windowRect: $($wr.Left),$($wr.Top)-$($wr.Right),$($wr.Bottom) ($($wr.Right-$wr.Left)x$($wr.Bottom-$wr.Top))"
Write-Output "clientRect: 0,0-$($cr.Right),$($cr.Bottom) ($($cr.Right)x$($cr.Bottom))"
Write-Output "clientOriginScreen: $($pt.X),$($pt.Y)"
Write-Output "LOGPIXELSY: $logpix (96=100%, 120=125%)"
# 对 nav 三个屏幕点做物理→逻辑换算
foreach ($x in @(884, 964, 1009)) {
  $q = New-Object CM+POINT; $q.X = $x; $q.Y = 89
  [void][CM]::PhysicalToLogicalPointForPerMonitorDPI($h, [ref]$q)
  Write-Output "phys($x,89) -> logical($($q.X),$($q.Y))"
}
