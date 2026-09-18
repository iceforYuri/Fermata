# Inject Ctrl+Alt+Shift+O via SendInput scancodes (standalone injector)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Injector {
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
  static INPUT Key(ushort scan, bool up) {
    return new INPUT { type = INPUT_KEYBOARD, u = new INPUTUNION { ki = new KEYBDINPUT {
      wVk = 0, wScan = scan, dwFlags = KEYEVENTF_SCANCODE | (up ? KEYEVENTF_KEYUP : 0), time = 0, dwExtraInfo = UIntPtr.Zero } } };
  }
  public static uint SendCombo() {
    INPUT[] seq = new INPUT[] {
      Key(0x1D, false), Key(0x38, false), Key(0x2A, false),
      Key(0x18, false), Key(0x18, true),
      Key(0x2A, true), Key(0x38, true), Key(0x1D, true),
    };
    return SendInput((uint)seq.Length, seq, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
$sent = [Injector]::SendCombo()
Write-Output "SendInput sent=$sent/8"
