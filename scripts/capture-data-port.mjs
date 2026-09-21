// data-port 截图×3：导出回显 / 确认覆盖层（真实组件走 mock 流）/ 导入回执
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=tab-settings]");
await page.click("[data-testid=tab-settings]");
await page.waitForSelector("[data-testid=export-snapshot]");
// 滚到数据组
await page.evaluate(() => {
  document.querySelector("[data-sec=data]")?.scrollIntoView({ block: "center" });
});
await sleep(400);

// 1. 导出回显
await page.click("[data-testid=export-snapshot]");
await sleep(400);
await page.waitForSelector("[data-testid=export-path]");
const sec = await page.locator("[data-sec=data]").boundingBox();
await page.screenshot({
  path: "docs/screenshots/v12/data-port-export.png",
  clip: { x: sec.x - 24, y: sec.y - 20, width: sec.width + 48, height: Math.min(sec.height + 40, 820) },
});
console.log("saved data-port-export.png");

// 2. 确认覆盖层（真实组件：设置页导入按钮 → mock 路径 → check → 覆盖层）
await page.click("[data-testid=import-snapshot]");
await page.waitForSelector("[data-testid=import-confirm]");
await sleep(350);
await page.screenshot({ path: "docs/screenshots/v12/data-port-confirm.png" });
console.log("saved data-port-confirm.png");

// 3. 导入回执
await page.click("[data-testid=import-confirm-btn]");
await page.waitForSelector("[data-testid=export-path]");
await sleep(400);
await page.screenshot({
  path: "docs/screenshots/v12/data-port-receipt.png",
  clip: { x: sec.x - 24, y: sec.y - 20, width: sec.width + 48, height: Math.min(sec.height + 60, 820) },
});
console.log("saved data-port-receipt.png");
await browser.close();
