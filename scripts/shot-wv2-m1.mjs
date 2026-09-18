// M1 真实 WebView2 截图（CDP :9222）：主版面 / 详情栏 / 稿库
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "docs/screenshots/m1";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://localhost:9222");
const pages = browser.contexts().flatMap((c) => c.pages());
const page = pages.find((p) => p.url().includes("127.0.0.1:14200"));
if (!page) {
  console.error("主窗未找到", pages.map((p) => p.url()));
  process.exit(1);
}
await page.waitForSelector("[data-testid=board-page]", { timeout: 20000 });
await page.waitForTimeout(800);

const summary = await page.evaluate(() => ({
  active: document.querySelector("[data-testid=active-row] .active-title")?.textContent,
  suspended: document.querySelectorAll("[data-testid=suspended-row]").length,
  donebar: document.querySelector("[data-testid=donebar]")?.textContent?.trim(),
  ring: document.querySelector("[data-testid=time-ring] .ring-label")?.textContent,
}));
console.log("[wv2] 版面摘要:", JSON.stringify(summary));

await page.screenshot({ path: `${OUT}/wv2-board.png` });
await page.click("[data-testid=active-row] .row-main");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/wv2-detail.png` });
await page.click("[data-testid=detail-close]");
await page.click("[data-testid=lib-toggle]");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/wv2-library.png` });
console.log("[wv2] 3 张已存");
await browser.close();
