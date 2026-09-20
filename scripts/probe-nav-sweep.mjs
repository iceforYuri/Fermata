// 横扫真实点击：固定物理范围，记录激活 tab——直接测命中区边界（无需窗口矩形）
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=capsule-nav]", { timeout: 15000 });
await page.waitForTimeout(800);

// 页面内信息：window.screenX/Y + DPR + tab CSS 区间（供事后对照）
const info = await page.evaluate(() => ({
  screenX: window.screenX, screenY: window.screenY,
  outerW: window.outerWidth, outerH: window.outerHeight,
  innerW: window.innerWidth, dpr: devicePixelRatio,
  tabs: Object.fromEntries(["board", "stats", "settings"].map((k) => {
    const r = document.querySelector(`[data-testid=tab-${k}]`).getBoundingClientRect();
    return [k, [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)]];
  })),
}));
console.log("页面信息:", JSON.stringify(info));

for (let x = 760; x <= 1120; x += 15) {
  execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/probe-nav-sweep.ps1", "-X", String(x), "-Y", "89"], { encoding: "utf8" });
  await page.waitForTimeout(450);
  const cur = await page.evaluate(() => document.querySelector(".morph-tab.active")?.dataset.testid ?? "none");
  console.log(`x=${x} → ${cur}`);
}
await browser.close();
