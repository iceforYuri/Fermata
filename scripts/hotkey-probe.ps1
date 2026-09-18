param([string]$out = "hotkey-probe.log")
# Standalone probe: RegisterHotKey(Alt+Q) on own window, self-inject Alt+Q after 1.5s, report after 3.5s
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
public class HotkeyProbe : Form {
  [DllImport("user32.dll")] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public bool Fired = false;
  public bool Registered = false;
  protected override void OnLoad(EventArgs e) {
    base.OnLoad(e);
    Registered = RegisterHotKey(this.Handle, 1, 0x0001, 0x51); // MOD_ALT, VK_Q
    var t1 = new Timer { Interval = 1500 };
    t1.Tick += (s, ev) => {
      t1.Stop();
      keybd_event(0x12, 0, 0, UIntPtr.Zero); // Alt down
      keybd_event(0x51, 0, 0, UIntPtr.Zero); // Q down
      keybd_event(0x51, 0, 2, UIntPtr.Zero); // Q up
      keybd_event(0x12, 0, 2, UIntPtr.Zero); // Alt up
    };
    t1.Start();
    var t2 = new Timer { Interval = 3500 };
    t2.Tick += (s, ev) => { t2.Stop(); Application.Exit(); };
    t2.Start();
  }
  protected override void WndProc(ref Message m) {
    if (m.Msg == 0x0312) Fired = true; // WM_HOTKEY
    base.WndProc(ref m);
  }
  protected override void OnClosed(EventArgs e) {
    UnregisterHotKey(this.Handle, 1);
    base.OnClosed(e);
  }
}
"@
$f = New-Object HotkeyProbe
$f.ShowInTaskbar = $false; $f.Width = 100; $f.Height = 100
[System.Windows.Forms.Application]::Run($f) | Out-Null
"registered=$($f.Registered) fired=$($f.Fired)" | Out-File -FilePath $out -Encoding utf8
Get-Content $out
