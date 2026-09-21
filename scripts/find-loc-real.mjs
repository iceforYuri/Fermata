// 真机（WebView2）验证：设置页"存储位置"行存在性 + 构建戳 + 实拍
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.waitForSelector("[data-testid=tab-settings]", { timeout: 15000 });
await page.click("[data-testid=tab-settings]");
await page.waitForSelector("[data-testid=export-snapshot]", { timeout: 8000 });
await sleep(300);
await page.evaluate(() => document.querySelector("[data-sec=data]")?.scrollIntoView({ block: "center" }));
await sleep(500);

const info = await page.evaluate(() => {
  const row = document.querySelector("[data-testid=data-location-change]");
  const path = document.querySelector("[data-testid=data-location-path]");
  const stamp = document.querySelector("[data-testid=build-stamp]")?.textContent ?? null;
  if (!row) return { exists: false, stamp };
  const r = row.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    exists: true,
    visible: r.width > 0 && r.height > 0,
    inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
    covered: !row.contains(hit) && hit !== row,
    rowText: row.closest(".set-row")?.textContent?.trim(),
    pathText: path ? path.textContent : "(无路径行)",
    stamp,
    viewport: { w: window.innerWidth, h: window.innerHeight },
  };
});
console.log(JSON.stringify(info, null, 2));

const sec = await page.locator("[data-sec=data]").boundingBox();
await page.screenshot({
  path: "docs/screenshots/v12/find-loc-real-section.png",
  clip: { x: Math.max(sec.x - 24, 0), y: Math.max(sec.y - 20, 0), width: sec.width + 48, height: Math.min(sec.height + 60, 900) },
});
await page.screenshot({ path: "docs/screenshots/v12/find-loc-real-full.png" });
console.log("saved find-loc-real-section.png / find-loc-real-full.png");
process.exit(info.exists ? 0 : 1);
