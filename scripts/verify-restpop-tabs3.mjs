// 终验 v3：统计页停驻 → 弹窗原生窗口真实可见（Win32 IsWindowVisible）
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vis = () => {
  try { return execFileSync("powershell", ["-NoProfile", "-File", "scripts/enum-restpop-visible.ps1"]).toString(); }
  catch { return ""; }
};
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const pages = browser.contexts()[0].pages();
const main = pages.find((p) => !p.url().includes("overlay"));
await main.waitForSelector("[data-testid=board-page]", { timeout: 10000 });
await main.click("[data-testid=new-row-input]");
await main.keyboard.type("探针进程");
await main.keyboard.press("Enter");
await sleep(600);
await main.locator("[data-testid=suspended-row] .row-main").first().click();
await sleep(800);
if ((await main.locator("[data-testid=bp-card]").count()) > 0) { await main.keyboard.press("Enter"); await sleep(500); }
await main.evaluate(() => window.__TAURI_INTERNALS__.invoke("setting_set", { key: "rest_mode", value: "hard" }));
await main.evaluate(() => window.__TAURI_INTERNALS__.invoke("debug_set_time_scale", { factor: 60 }));
console.log("触发前弹窗窗体状态:", vis().trim() || "（无匹配窗）");
await main.click("[data-testid=tab-stats]");
console.log("已停驻统计页，等触发…");
for (let i = 0; i < 60; i++) {
  const v = vis();
  if (v.includes("visible=True")) {
    const resting = await main.evaluate(() => window.__TAURI_INTERNALS__.invoke("q_rest_state")).then((r) => r.resting);
    console.log(`第 ${i * 2}s：弹窗原生窗口 visible=True，resting=${resting}`);
    console.log("✓ 统计页停驻：弹窗真实弹出（原生窗口可见）");
    process.exit(0);
  }
  await sleep(2000);
}
console.log("✗ FAIL 120s 内弹窗原生窗口不可见");
process.exit(1);
