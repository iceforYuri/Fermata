// 横扫测绘 v2：Rust 探针（DPI 精确）+ CDP 预置态区分命中/未命中
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const PROBE = "scripts/input-probe/target/release/input-probe.exe";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=capsule-nav]", { timeout: 15000 });
await page.waitForTimeout(800);

const active = () => page.evaluate(() => document.querySelector(".morph-tab.active")?.dataset.testid ?? "none");
const cdpSet = async (t) => { await page.click(`[data-testid=tab-${t}]`); await page.waitForTimeout(500); };

for (let x = 700; x <= 1150; x += 15) {
  await cdpSet("board"); // 预置：board
  execFileSync(PROBE, [String(x), "89", "click"]);
  await page.waitForTimeout(450);
  const r1 = await active();
  await cdpSet("stats"); // 预置：stats
  execFileSync(PROBE, [String(x), "89", "click"]);
  await page.waitForTimeout(450);
  const r2 = await active();
  // 解码：(r1=board,r2=board)→命中 board；(stats,stats)→命中 stats；(settings,settings)→命中 settings；(board,stats)→未命中
  const zone = r1 === "tab-board" && r2 === "tab-board" ? "命中board"
    : r1 === "tab-stats" && r2 === "tab-stats" ? "命中stats"
    : r1 === "tab-settings" && r2 === "tab-settings" ? "命中settings"
    : r1 === "tab-board" && r2 === "tab-stats" ? "未命中" : `?(${r1},${r2})`;
  console.log(`x=${x} → ${zone}`);
}
await browser.close();
