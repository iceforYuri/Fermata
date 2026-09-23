import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=board-page]");
await page.click("[data-testid=tab-stats]");
await sleep(900);
const w = await page.evaluate(() => document.querySelector(".stats-measure").getBoundingClientRect().width);
console.log("stats-measure 宽度:", Math.round(w), "px（窗口 1440，60% =", 1440 * 0.6, "）");
await page.screenshot({ path: "docs/screenshots/v13/stats-width-920.png" });
// 年视角也来一张
await page.click("[data-testid=capsule-year]");
await sleep(500);
await page.screenshot({ path: "docs/screenshots/v13/stats-width-year.png" });
await browser.close();
