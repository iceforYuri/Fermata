// plan-ops 动效中间帧：完成划线画出半途（CSS 过渡减速 20 倍，行留在列表故可稳定截帧）
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

await page.fill("[data-testid=dv-plan-input]", "划线中的计划");
await page.press("[data-testid=dv-plan-input]", "Enter");
await sleep(400);

// 过渡减速 20 倍（160ms→3.2s），点击后 ~1s 截图 = 划线画到 ~30%
await page.addStyleTag({ content: "*, *::before, *::after { transition-duration: 3200ms !important; }" });
const strikeRow = page.locator("[data-testid=dv-plan-row]", { hasText: "划线中的计划" });
await strikeRow.locator("[data-testid=dv-plan-done]").click();
await sleep(500); // 减速后 ~16% 时长 → ease-out 划线画到 ~55%

const scale = await strikeRow.locator(".dv-plan-title").evaluate((el) => getComputedStyle(el, "::after").transform);
const stateNow = await strikeRow.getAttribute("data-state");
console.log("mid strike transform:", scale, "| state:", stateNow);

const dv = await page.locator("[data-testid=dayview]").boundingBox();
await page.screenshot({
  path: "docs/screenshots/v12/plan-ops-anim.png",
  clip: { x: dv.x - 20, y: dv.y, width: dv.width + 40, height: Math.min(dv.height, 940 - dv.y) },
});
console.log("saved docs/screenshots/v12/plan-ops-anim.png");
await browser.close();
