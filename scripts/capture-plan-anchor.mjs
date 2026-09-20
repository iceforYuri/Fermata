// 锚点稳定证据帧：✓ 点击后幽灵沉降中段截图 + 头部位移日志（前后对照）
import { chromium } from "playwright";
import { writeFileSync } from "fs";
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
await page.click(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=dayview]");
await sleep(400);
await page.fill("[data-testid=dv-plan-input]", "锚点证据计划");
await page.press("[data-testid=dv-plan-input]", "Enter");
await sleep(800); // 过创建的钉窗

const SC = "[data-testid=drill-current] .stats-scroll";
await page.evaluate((sel) => {
  const sc = document.querySelector(sel);
  const head = document.querySelector("[data-testid=dv-plans] .detail-label");
  sc.scrollTop = head.getBoundingClientRect().top + sc.scrollTop - sc.getBoundingClientRect().top - 300;
}, SC);
await sleep(150);

const headTop = () => page.evaluate(() => document.querySelector("[data-testid=dv-plans] .detail-label").getBoundingClientRect().top);
const t0 = await headTop();
const row = page.locator("[data-testid=dv-plan-row]", { hasText: "锚点证据计划" });
await row.locator("[data-testid=dv-plan-done]").click();
await sleep(110); // 幽灵沉降中段
const tMid = await headTop();

const dv = await page.locator("[data-testid=dayview]").boundingBox();
await page.screenshot({
  path: "docs/screenshots/v12/plan-anchor.png",
  clip: { x: dv.x - 20, y: Math.max(44, tMid - 160), width: dv.width + 40, height: 420 },
});
await sleep(700);
const t1 = await headTop();
const log = `# 锚点稳定证据：✓ 勾选完成 → 未做区幽灵沉降（200ms）全程钉住计划区头\n操作前头位置: ${t0.toFixed(1)}\n沉降中段: ${tMid.toFixed(1)} (Δ=${(tMid - t0).toFixed(1)}px)\n沉降完成后: ${t1.toFixed(1)} (Δ=${(t1 - t0).toFixed(1)}px)\n`;
writeFileSync("docs/screenshots/v12/plan-anchor.log.txt", log);
console.log(log);
console.log("saved docs/screenshots/v12/plan-anchor.png");
await browser.close();
