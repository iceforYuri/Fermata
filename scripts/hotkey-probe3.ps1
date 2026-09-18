param([string]$out = "hotkey-probe3.log")
# Decisive probe: register free combo Ctrl+Alt+Shift+O on own window, self-inject it, check WM_HOTKEY
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Text;
public class HotkeyProbe3 : Form {
  [DllImport("user32.dll", SetLastError=true)] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public StringBuilder Report = new StringBuilder();
  protected override void OnLoad(EventArgs e) {
    base.OnLoad(e);
    bool ok = RegisterHotKey(this.Handle, 9, 0x0007, 0x4F); // Ctrl+Alt+Shift+O
    Report.AppendLine("registered=" + ok + " err=" + Marshal.GetLastWin32Error());
    var t1 = new Timer { Interval = 1500 };
    t1.Tick += (s, ev) => {
      t1.Stop();
      keybd_event(0x11, 0, 0, UIntPtr.Zero); // Ctrl
      keybd_event(0x12, 0, 0, UIntPtr.Zero); // Alt
      keybd_event(0x10, 0, 0, UIntPtr.Zero); // Shift
      keybd_event(0x4F, 0, 0, UIntPtr.Zero); // O down
      keybd_event(0x4F, 0, 2, UIntPtr.Zero); // O up
      keybd_event(0x10, 0, 2, UIntPtr.Zero);
      keybd_event(0x12, 0, 2, UIntPtr.Zero);
      keybd_event(0x11, 0, 2, UIntPtr.Zero);
      Report.AppendLine("injected");
    };
    t1.Start();
    var t2 = new Timer { Interval = 3500 };
    t2.Tick += (s, ev) => { t2.Stop(); Application.Exit(); };
    t2.Start();
  }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x0312) Report.AppendLine("WM_HOTKEY id=" + m.WParam);
    base.WndProc(ref m);
  }
  protected override void OnClosed(EventArgs e) {
    UnregisterHotKey(this.Handle, 9);
    base.OnClosed(e);
  }
}
"@
$f = New-Object HotkeyProbe3
$f.ShowInTaskbar = $false; $f.Width = 100; $f.Height = 100
[System.Windows.Forms.Application]::Run($f) | Out-Null
$f.Report.ToString() | Out-File -FilePath $out -Encoding utf8
Get-Content $out
