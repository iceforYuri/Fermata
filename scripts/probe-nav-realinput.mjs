// 编排：置顶 fermata → CDP 量坐标 → PowerShell SendInput 真实点击 → CDP 验证
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=capsule-nav]", { timeout: 15000 });
await page.waitForTimeout(800);

const ps = (code) => execFileSync("powershell", ["-NoProfile", "-Command", code], { encoding: "utf8" }).trim();

// 置顶 fermata 主窗（保证真实点击落在它上面）
ps(`
Add-Type @"
using System; using System.Runtime.InteropServices;
public class WZ { [DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int cx, int cy, uint f); }
"@
$p = Get-Process fermata | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
[WZ]::SetWindowPos($p.MainWindowHandle, [IntPtr]::New(-1), 0, 0, 0, 0, 3) | Out-Null  # TOPMOST|NOMOVE|NOSIZE
"done"
`);

const winRect = JSON.parse(ps(`
Add-Type @"
using System; using System.Runtime.InteropServices;
public class WR2 { [DllImport("user32.dll")] public static extern bool GetWindowRect(System.IntPtr h, out RECT2 r); }
public struct RECT2 { public int Left, Top, Right, Bottom; }
"@
$p = Get-Process fermata | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$r = New-Object RECT2; [void][WR2]::GetWindowRect($p.MainWindowHandle, [ref]$r)
@{ left = $r.Left; top = $r.Top; right = $r.Right; bottom = $r.Bottom } | ConvertTo-Json -Compress
`));
console.log("窗口矩形:", JSON.stringify(winRect));

const dpr = await page.evaluate(() => devicePixelRatio);
const geo = await page.evaluate(() => {
  const out = {};
  for (const k of ["board", "stats", "settings"]) {
    const r = document.querySelector(`[data-testid=tab-${k}]`).getBoundingClientRect();
    out[k] = { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  }
  return out;
});
console.log("DPR:", dpr, "tab 视口坐标:", JSON.stringify(geo));

const toScreen = (p) => ({ x: Math.round(winRect.left + p.cx * dpr), y: Math.round(winRect.top + p.cy * dpr) });

let ok = 0, total = 0;
for (const target of ["stats", "board", "settings", "board", "stats", "board"]) {
  const s = toScreen(geo[target]);
  const out = execFileSync("powershell", ["-NoProfile", "-File", "scripts/probe-nav-realinput.ps1", "-X", String(s.x), "-Y", String(s.y)], { encoding: "utf8" }).trim();
  console.log(`  [${out}]`);
  await page.waitForTimeout(700);
  const cur = await page.evaluate(() => document.querySelector(".morph-tab.active")?.dataset.testid);
  const pass = cur === `tab-${target}`;
  total++; if (pass) ok++;
  console.log(`真实点击 (${s.x},${s.y}) → ${cur} ${pass ? "✓" : "✗ 期望 " + target}`);
}
console.log(`真实输入点击成功率: ${ok}/${total}`);

// 取消置顶
ps(`
Add-Type @"
using System; using System.Runtime.InteropServices;
public class WZ2 { [DllImport("user32.dll")] public static extern bool SetWindowPos(System.IntPtr h, System.IntPtr after, int x, int y, int cx, int cy, uint f); }
"@
$p = Get-Process fermata | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
[WZ2]::SetWindowPos($p.MainWindowHandle, [IntPtr]::New(-2), 0, 0, 0, 0, 3) | Out-Null
"done"
`);
await browser.close();
process.exit(ok === total ? 0 : 1);
