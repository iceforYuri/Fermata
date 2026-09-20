// 导航结构性修复断言：拖拽区与导航零交叠 + morph 全程 tab 中心不动
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:14200";
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.waitForTimeout(500);

// 1. 拖拽区与导航足印零交叠
const ov = await page.evaluate(() => {
  const nav = document.querySelector("[data-testid=capsule-nav]").getBoundingClientRect();
  return [...document.querySelectorAll(".drag-side")].map((el) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(r.right, nav.right) - Math.max(r.left, nav.left));
  });
});
console.log("拖拽区与导航交叠 px:", JSON.stringify(ov), ov.every((v) => v === 0) ? "PASS" : "FAIL");

// 2. morph 全程 tab 中心不动：点击 stats，在 0/60/120/240ms 采样三个 tab 的中心 x
await page.click("[data-testid=tab-stats]");
const centers = await page.evaluate(async () => {
  const read = () => [...document.querySelectorAll(".morph-slot")].map((s) => {
    const r = s.getBoundingClientRect();
    return Math.round(r.left + r.width / 2);
  });
  const frames = [read()];
  for (const ms of [60, 120, 240]) {
    await new Promise((r) => setTimeout(r, ms));
    frames.push(read());
  }
  return frames;
});
console.log("morph 各帧槽位中心:", JSON.stringify(centers));
const stable = centers.every((f) => JSON.stringify(f) === JSON.stringify(centers[0]));
console.log(stable ? "槽位中心全程不动 PASS" : "槽位中心漂移 FAIL");

await page.screenshot({ path: "docs/screenshots/v12/nav-hitzone-fixed.png" });
await browser.close();
process.exit(ov.every((v) => v === 0) && stable ? 0 : 1);
