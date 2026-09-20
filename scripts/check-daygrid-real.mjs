// 真实 exe + 真实库：日视角体检（截图×3 + 几何 + 浮窗）
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
console.log("页面:", page.url());
await page.waitForSelector("[data-testid=tab-stats]", { timeout: 15000 });
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await page.waitForTimeout(900);
await page.screenshot({ path: "docs/screenshots/v12/real-v124-month.png" });
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await page.waitForTimeout(1500);
const m = await page.evaluate(() => {
  const sc = document.querySelector(".daygrid-scroll");
  const units = [...document.querySelectorAll("[data-testid=day-unit]")];
  const vis = units.filter((u) => { const r = u.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
  return {
    scrollTop: Math.round(sc.scrollTop), scrollH: sc.scrollHeight, clientH: sc.clientHeight,
    unitsTotal: units.length,
    visible: vis.map((u) => ({ day: u.dataset.day, y: Math.round(u.getBoundingClientRect().top), h: Math.round(u.getBoundingClientRect().height) })),
    dots: document.querySelectorAll(".dg-dot").length,
    halves: document.querySelectorAll(".dg-half").length,
  };
});
console.log(JSON.stringify(m, null, 1));
await page.screenshot({ path: "docs/screenshots/v12/real-v124-day.png" });
await page.evaluate(() => { const sc = document.querySelector(".daygrid-scroll"); sc.scrollTop = sc.scrollHeight; });
await page.waitForTimeout(800);
await page.screenshot({ path: "docs/screenshots/v12/real-v124-day-bottom.png" });
process.exit(0);
