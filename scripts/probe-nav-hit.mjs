// 真实 exe 顶栏命中体检：elementFromPoint / computed cursor / 拖拽区重叠 / 点击成功率
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=capsule-nav]", { timeout: 15000 });
await page.waitForTimeout(800);

// 1. 每个 tab 中心与边缘的命中元素 + computed cursor
const hits = await page.evaluate(() => {
  const nav = document.querySelector("[data-testid=capsule-nav]");
  const nr = nav.getBoundingClientRect();
  const tabs = [...document.querySelectorAll(".morph-tab")].map((el) => {
    const r = el.getBoundingClientRect();
    const probe = (x, y) => {
      const h = document.elementFromPoint(x, y);
      return h ? `${h.tagName}.${String(h.className).split(" ")[0]}|cursor:${getComputedStyle(h).cursor}` : "null";
    };
    return {
      key: el.dataset.testid,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      center: probe(r.x + r.width / 2, r.y + r.height / 2),
      top2px: probe(r.x + r.width / 2, r.y + 2),
      bottom2px: probe(r.x + r.width / 2, r.y + r.height - 2),
    };
  });
  return {
    navRect: { x: Math.round(nr.x), y: Math.round(nr.y), w: Math.round(nr.width), h: Math.round(nr.height) },
    dpr: devicePixelRatio,
    tabs,
  };
});
console.log(JSON.stringify(hits, null, 1));

// 2. 拖拽区与导航的几何重叠
const overlap = await page.evaluate(() => {
  const nav = document.querySelector("[data-testid=capsule-nav]").getBoundingClientRect();
  return [...document.querySelectorAll(".drag-side")].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), w: Math.round(r.width), overlapWithNav: Math.max(0, Math.min(r.right, nav.right) - Math.max(r.left, nav.left)) };
  });
});
console.log("拖拽区:", JSON.stringify(overlap));

// 3. 真实点击成功率：统计↔进程 交替 20 次，每次读 current tab
let okCount = 0;
for (let i = 0; i < 20; i++) {
  const target = i % 2 === 0 ? "stats" : "board";
  const el = await page.$(`[data-testid=tab-${target}]`);
  const b = await el.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(450); // 等切换+动画
  const cur = await page.evaluate(() => document.querySelector(".morph-tab.active")?.dataset.testid);
  if (cur === `tab-${target}`) okCount++;
}
console.log(`点击成功率: ${okCount}/20`);
await browser.close();
