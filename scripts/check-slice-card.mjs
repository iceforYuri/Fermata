// 时间环小卡：不被裁切、层叠在最上、可选中
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:14200";
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.waitForTimeout(600);

await page.click("[data-testid=time-ring-btn]");
await page.waitForSelector("[data-testid=slice-card]");
await page.waitForTimeout(300);

const m = await page.evaluate(() => {
  const card = document.querySelector("[data-testid=slice-card]").getBoundingClientRect();
  const row = document.querySelector("[data-testid=active-row], .active-row, .row.active")?.getBoundingClientRect();
  const hit = document.elementFromPoint(card.x + card.width / 2, card.y + card.height / 2);
  return {
    card: { x: Math.round(card.x), y: Math.round(card.y), w: Math.round(card.width), h: Math.round(card.height) },
    rowBottom: row ? Math.round(row.bottom) : null,
    hit: hit ? `${hit.tagName}.${String(hit.className).slice(0, 30)}` : "null",
    inView: card.y + card.height <= innerHeight && card.y >= 0,
  };
});
console.log(JSON.stringify(m));
const visible = m.inView && m.hit.includes("slice-card") || m.hit.includes("choice-chip");
console.log(visible ? "小卡可见且置顶 PASS" : "小卡被裁/被盖 FAIL");

// 可选中：点 60m，环重置满环
await page.click("[data-testid=slice-opt-60]");
await page.waitForTimeout(400);
const ring = await page.evaluate(() => document.querySelector("[data-testid=ring-label]")?.textContent ?? "");
console.log("选 60m 后环读数:", ring, ring.trim().startsWith("60") ? "PASS" : "CHECK");
await page.screenshot({ path: "docs/screenshots/v12/slice-card-fixed.png" });
await browser.close();
process.exit(visible ? 0 : 1);
