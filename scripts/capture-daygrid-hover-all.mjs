// daygrid-hover-all 截图：整格 hover（偏离圆点的格角）出全量占用清单
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const yd = new Date(Date.now() - 86400000);
const yStr = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, "0")}-${String(yd.getDate()).padStart(2, "0")}`;

await page.goto("http://127.0.0.1:14200/?fixture=gridmulti");
await page.waitForSelector("[data-testid=tab-stats]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await sleep(400);
await page.dblclick(`[data-testid=cal-cell][data-day="${yStr}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(800);

const cell = page.locator(`.day-unit[data-day="${yStr}"] .dg-cell:has([data-testid=dg-dot])`).first();
const cb = await cell.boundingBox();
await page.mouse.move(cb.x + 2, cb.y + 2); // 格角（非圆点本体）→ 整格命中
await sleep(400);

// 取格周缘区域（含浮窗）
await page.screenshot({
  path: "docs/screenshots/v12/daygrid-hover-all.png",
  clip: { x: Math.max(0, cb.x - 120), y: Math.max(44, cb.y - 200), width: 560, height: 340 },
});
console.log("saved docs/screenshots/v12/daygrid-hover-all.png");
await browser.close();
