// 定位"存储位置"行：存在性 / 几何 / 是否被遮挡 + 实拍
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=tab-settings]");
await page.click("[data-testid=tab-settings]");
await page.waitForSelector("[data-testid=export-snapshot]");
await sleep(300);

// 滚到数据组
await page.evaluate(() => {
  document.querySelector("[data-sec=data]")?.scrollIntoView({ block: "center" });
});
await sleep(500);

const info = await page.evaluate(() => {
  const row = document.querySelector("[data-testid=data-location-change]");
  const path = document.querySelector("[data-testid=data-location-path]");
  if (!row) return { exists: false };
  const r = row.getBoundingClientRect();
  // 行中心点实际命中的元素（检测遮挡）
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const chain = [];
  let el = hit;
  while (el && chain.length < 5) { chain.push(el.className || el.tagName); el = el.parentElement; }
  const sec = document.querySelector("[data-sec=data]").getBoundingClientRect();
  const scroll = document.querySelector(".settings-scroll").getBoundingClientRect();
  return {
    exists: true,
    rowRect: { x: r.x, y: r.y, w: r.width, h: r.height },
    visible: r.width > 0 && r.height > 0,
    inViewport: r.top >= 0 && r.bottom <= window.innerHeight,
    hitChain: chain,
    covered: !row.contains(hit) && hit !== row,
    pathText: path ? path.textContent : "(无路径行)",
    secRect: { y: sec.y, h: sec.height },
    scrollRect: { y: scroll.y, h: scroll.height, bottom: scroll.bottom },
    clipped: r.bottom > scroll.bottom || r.top < scroll.top,
  };
});
console.log(JSON.stringify(info, null, 2));

// 整页 + 数据组特写
await page.screenshot({ path: "docs/screenshots/v12/find-loc-full.png" });
const sec = await page.locator("[data-sec=data]").boundingBox();
await page.screenshot({
  path: "docs/screenshots/v12/find-loc-section.png",
  clip: { x: Math.max(sec.x - 24, 0), y: Math.max(sec.y - 20, 0), width: sec.width + 48, height: Math.min(sec.height + 40, 860) },
});
console.log("saved find-loc-full.png / find-loc-section.png");
await browser.close();
