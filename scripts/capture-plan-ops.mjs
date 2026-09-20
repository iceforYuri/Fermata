// plan-ops 截图：当天视图计划区——完成态划线+hover ↩ + pool 行编辑态
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=tab-stats]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await sleep(400);
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(500);
await page.click(`.day-unit[data-day="${ds}"] .day-big-label`);
await page.waitForSelector("[data-testid=month-cal]");
await page.click(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=dayview]");
await sleep(400);

// 造一条计划并完成（得一条完成态行）
await page.fill("[data-testid=dv-plan-input]", "回完合作方的邮件");
await page.press("[data-testid=dv-plan-input]", "Enter");
await sleep(500);
const doneRow = page.locator("[data-testid=dv-plan-row]", { hasText: "回完合作方的邮件" });
await doneRow.locator("[data-testid=dv-plan-done]").click();
await sleep(500);

// pool 行进编辑态
const poolRow = page.locator("[data-testid=dv-plan-row][data-state=pool]").first();
await poolRow.locator("[data-testid=dv-plan-title]").click();
await poolRow.locator("[data-testid=dv-plan-title-editing]").waitFor();

// hover 完成行 → ↩ 显现
await doneRow.hover();
await sleep(300);

const dv = await page.locator("[data-testid=dayview]").boundingBox();
await page.screenshot({
  path: "docs/screenshots/v12/plan-ops.png",
  clip: { x: dv.x - 20, y: dv.y, width: dv.width + 40, height: Math.min(dv.height, 940 - dv.y) },
});
console.log("saved docs/screenshots/v12/plan-ops.png");
await browser.close();
