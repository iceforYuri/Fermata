param([string]$out = "hotkey-probe4.log")
# Probe 4: same as probe3 but SendInput with hardware scancodes (KEYEVENTF_SCANCODE)
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using System.Text;
public class HotkeyProbe4 : Form {
  [DllImport("user32.dll", SetLastError=true)] public static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
  [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr hWnd, int id);
  [DllImport("user32.dll")] public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public INPUTUNION u; }
  [StructLayout(LayoutKind.Explicit)] public struct INPUTUNION { [FieldOffset(0)] public KEYBDINPUT ki; [FieldOffset(0)] public MOUSEINPUT mi; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT {
    public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo;
  }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT {
    public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public UIntPtr dwExtraInfo;
  }
  const uint INPUT_KEYBOARD = 1;
  const uint KEYEVENTF_SCANCODE = 0x0008;
  const uint KEYEVENTF_KEYUP = 0x0002;
  public StringBuilder Report = new StringBuilder();
  static INPUT Key(ushort scan, bool up) {
    return new INPUT { type = INPUT_KEYBOARD, u = new INPUTUNION { ki = new KEYBDINPUT {
      wVk = 0, wScan = scan, dwFlags = KEYEVENTF_SCANCODE | (up ? KEYEVENTF_KEYUP : 0), time = 0, dwExtraInfo = UIntPtr.Zero } } };
  }
  protected override void OnLoad(EventArgs e) {
    base.OnLoad(e);
    bool ok = RegisterHotKey(this.Handle, 9, 0x0007, 0x4F); // Ctrl+Alt+Shift+O
    Report.AppendLine("registered=" + ok + " err=" + Marshal.GetLastWin32Error());
    var t1 = new Timer { Interval = 1500 };
    t1.Tick += (s, ev) => {
      t1.Stop();
      // scancodes: Ctrl=0x1D, Alt=0x38, Shift=0x2A, O=0x18
      INPUT[] seq = new INPUT[] {
        Key(0x1D, false), Key(0x38, false), Key(0x2A, false),
        Key(0x18, false), Key(0x18, true),
        Key(0x2A, true), Key(0x38, true), Key(0x1D, true),
      };
      uint sent = SendInput((uint)seq.Length, seq, Marshal.SizeOf(typeof(INPUT)));
      Report.AppendLine("SendInput sent=" + sent + "/" + seq.Length);
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
$f = New-Object HotkeyProbe4
$f.ShowInTaskbar = $false; $f.Width = 100; $f.Height = 100
[System.Windows.Forms.Application]::Run($f) | Out-Null
$f.Report.ToString() | Out-File -FilePath $out -Encoding utf8
Get-Content $out
