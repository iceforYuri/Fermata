param([string]$out = "hotkey-probe5.log")
# Probe 5: register-only listener; injection must come from ANOTHER process while this waits
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Text;
public class HotkeyProbe5 : Form {
  [DllImport("user32.dll", SetLastError=true)] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  public StringBuilder Report = new StringBuilder();
  protected override void OnLoad(EventArgs e) {
    base.OnLoad(e);
    bool ok = RegisterHotKey(this.Handle, 9, 0x0007, 0x4F); // Ctrl+Alt+Shift+O
    Report.AppendLine("registered=" + ok + " err=" + Marshal.GetLastWin32Error());
    var t2 = new Timer { Interval = 8000 };
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
$f = New-Object HotkeyProbe5
$f.ShowInTaskbar = $false; $f.Width = 100; $f.Height = 100
[System.Windows.Forms.Application]::Run($f) | Out-Null
$f.Report.ToString() | Out-File -FilePath $out -Encoding utf8
