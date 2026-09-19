// 日单元大日期标对齐自检：标签右缘应贴网格右缘（432px 容器）
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:14200";
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await page.waitForSelector("[data-testid=daygrid]");
await page.waitForTimeout(600);
const m = await page.evaluate(() => {
  const unit = document.querySelector("[data-testid=day-unit]:has([data-testid=daygrid])");
  const grid = unit.querySelector("[data-testid=daygrid]").getBoundingClientRect();
  const label = unit.querySelector("[data-testid=day-big-label]").getBoundingClientRect();
  return { gridRight: grid.right, labelRight: label.right, gap: label.top - grid.bottom };
});
const drift = Math.abs(m.gridRight - m.labelRight);
console.log(`grid右缘=${m.gridRight} 标签右缘=${m.labelRight} 偏差=${drift}px 标签在网格下方间距=${m.gap}px`);
console.log(drift <= 2 && m.gap >= 0 && m.gap <= 40 ? "PASS" : "FAIL");
await page.screenshot({ path: "docs/screenshots/v12/daygrid-unit.png" });
await browser.close();
