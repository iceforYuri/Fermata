// 日视角修复后状态体检：截图 + 关键几何
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:14200";
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await page.waitForTimeout(600);
await page.evaluate(() => { document.querySelector(".center-col").scrollLeft = 0; });
await page.screenshot({ path: "docs/screenshots/v12/check-v124-month.png" });
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await page.waitForTimeout(1200);
await page.evaluate(() => { document.querySelector(".center-col").scrollLeft = 0; });
const m = await page.evaluate(() => {
  const sc = document.querySelector(".daygrid-scroll");
  const units = [...document.querySelectorAll("[data-testid=day-unit]")];
  const grid = document.querySelector("[data-testid=daygrid]");
  const label = document.querySelector("[data-testid=day-big-label]");
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
  return {
    scrollTop: sc.scrollTop, scrollH: sc.scrollHeight, clientH: sc.clientHeight,
    units: units.length,
    unitInfo: units.slice(0, 3).map((u) => ({ day: u.dataset.day, ...r(u) })),
    grid: grid ? r(grid) : null,
    label: label ? r(label) : null,
    innerH: innerHeight,
  };
});
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: "docs/screenshots/v12/check-v124-day.png" });
// 滚到底看今天与底部垫高
await page.evaluate(() => { const sc = document.querySelector(".daygrid-scroll"); sc.scrollTop = sc.scrollHeight; });
await page.waitForTimeout(900);
await page.screenshot({ path: "docs/screenshots/v12/check-v124-day-bottom.png" });
await browser.close();
