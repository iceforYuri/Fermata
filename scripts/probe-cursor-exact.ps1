# 光标落点自证：SetCursorPos 后读回真实位置（无 struct，纯方法）
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CP {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out int x, out int y);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
}
"@
[void][CP]::SetProcessDpiAwarenessContext([IntPtr]::New(-4))
foreach ($p in @(@(964,89), @(884,89), @(1009,89))) {
  [void][CP]::SetCursorPos($p[0], $p[1])
  Start-Sleep -Milliseconds 50
  $x = 0; $y = 0; [void][CP]::GetCursorPos([ref]$x, [ref]$y)
  Write-Output "set($($p[0]),$($p[1])) -> actual($x,$y)"
}
