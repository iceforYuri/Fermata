// v1.2 遗漏修复：重截 4 张 + 像素自检
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const BASE = "http://127.0.0.1:14200";
const OUT = "docs/screenshots/v12";
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };

function pxRow(png, y) {
  const set = new Set();
  for (let x = 0; x < png.width; x += 4) {
    const i = (y * png.width + x) * 4;
    set.add(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`);
  }
  return set;
}

// 1. 顶栏无线（morph 导航重截）
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await sleep(700);
await page.screenshot({ path: `${OUT}/nav-morph-board.png` });
{
  const png = PNG.sync.read(readFileSync(`${OUT}/nav-morph-board.png`));
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const y = Math.round(43 * dpr);
  const row = pxRow(png, y);
  ok("顶栏 y=43 无线", row.size <= 2, `行内异色数=${row.size}`);
}

// 2. 日网格刻度仅下行（DOM + 像素）
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
// 等轨道滑停 + 清零横卷残留（Playwright 自动 scrollIntoView 会把 center-col 横卷）
await sleep(500); // 轨道滑动 240ms + 余量
await page.evaluate(() => { document.querySelector(".center-col").scrollLeft = 0; });
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(800);
const ticks = await page.$$eval(".dg-tick", (els) => els.map((e) => e.textContent));
const ticksTop = await page.$$eval("[data-testid=daygrid-ticks-top] .dg-tick", (els) => els.map((e) => e.textContent));
const ticksBottom = await page.$$eval("[data-testid=daygrid-ticks-bottom] .dg-tick", (els) => els.map((e) => e.textContent));
await page.screenshot({ path: `${OUT}/daygrid-half-circles.png` });
{
  const norm = (arr) => arr.map((t) => t.replace(/‑/g, "–"));
  const groupsOk = (arr) => {
    const g = norm(arr);
    if (g.length === 0 || g.length % 4 !== 0) return false;
    for (let i = 0; i < g.length; i += 4) {
      if (g.slice(i, i + 4).join() !== "6,12,18,24") return false;
    }
    return true;
  };
  ok(
    "日网格单点刻度仅下行",
    ticksTop.length === 0 && groupsOk(ticksBottom),
    `top ${ticksTop.length} / bottom ${ticksBottom.length}`,
  );
}

// 3. 休息页 ▶ 环心居中
await page.goto(`${BASE}/?fixture=rest`);
await page.waitForSelector("[data-testid=rest-page]");
await sleep(400);
await page.screenshot({ path: `${OUT}/rest-continue.png` });
const centers = await page.evaluate(() => {
  const ring = document.querySelector("[data-testid=rest-continue]").getBoundingClientRect();
  const play = document.querySelector(".rest-continue .play").getBoundingClientRect();
  return {
    ring: [ring.left + ring.width / 2, ring.top + ring.height / 2],
    play: [play.left + play.width / 2, play.top + play.height / 2],
  };
});
const err = Math.hypot(centers.ring[0] - centers.play[0], centers.ring[1] - centers.play[1]);
ok("▶ 在环心", err <= 2, `偏差=${err.toFixed(1)}px`);

// 4. 拖拽虚影帧 + 四边可辨
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await sleep(500);
const rows = await page.$$eval("[data-testid=suspended-row]", (els) => els.map((e) => e.dataset.pid));
const box = await page.locator(`[data-testid=suspended-row][data-pid="${rows[rows.length - 1]}"]`).boundingBox();
const qTop = await page.evaluate(() => document.querySelector("[data-testid=suspended-queue]").getBoundingClientRect().top);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, qTop + 40, { steps: 10 });
await sleep(300);
const ghostRect = await page.evaluate(() => {
  const g = document.querySelector("[data-testid=drop-ghost]");
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
});
await page.screenshot({ path: `${OUT}/drag-ghost-frame.png` });
await page.mouse.up();
if (!ghostRect) {
  ok("虚影四边可辨", false, "ghost 未渲染");
} else {
  const png = PNG.sync.read(readFileSync(`${OUT}/drag-ghost-frame.png`));
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const gx = Math.round(ghostRect.x * dpr), gy = Math.round(ghostRect.y * dpr);
  const gw = Math.round(ghostRect.w * dpr), gh = Math.round(ghostRect.h * dpr);
  const paper = [252, 251, 247];
  const diff = (x, y) => {
    const i = (y * png.width + x) * 4;
    return Math.abs(png.data[i] - paper[0]) + Math.abs(png.data[i + 1] - paper[1]) + Math.abs(png.data[i + 2] - paper[2]) > 24;
  };
  const edges = {
    top: [gx + Math.floor(gw / 2), gy + 1],
    bottom: [gx + Math.floor(gw / 2), gy + gh - 2],
    left: [gx + 1, gy + Math.floor(gh / 2)],
    right: [gx + gw - 2, gy + Math.floor(gh / 2)],
  };
  const vis = Object.fromEntries(Object.entries(edges).map(([k, [x, y]]) => [k, diff(x, y)]));
  ok("虚影四边可辨", Object.values(vis).every(Boolean), JSON.stringify(vis));
}

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n== 自检 ${results.length - failed}/${results.length} 通过 ==`);
process.exit(failed ? 1 : 0);
