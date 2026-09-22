// 圆径一致性 v2：locator 级截图，免去 clip 坐标与滚动竞态
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=tab-stats]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await sleep(500);
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(900);

const sat = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === 0 ? 0 : (mx - mn) / mx; };
const measurePng = (path) => {
  const png = PNG.sync.read(readFileSync(path));
  const { width: W, height: H, data: D } = png;
  let minX = W, maxX = -1, minY = H, maxY = -1, n = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const [r, g, b] = [D[i], D[i + 1], D[i + 2]];
      if (sat(r, g, b) > 0.1 && !(r > 235 && g > 230 && b > 220)) {
        n++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  return n ? { w: maxX - minX + 1, h: maxY - minY + 1, n } : null;
};

// 逐个 dg-cell 找：第一个可见的全圆格 / 分瓣格
const kinds = await page.evaluate(() => {
  const out = { full: null, half: null };
  [...document.querySelectorAll(".dg-cell")].forEach((c, i) => {
    if (!out.full && c.querySelector("span.dg-dot")) out.full = i;
    if (!out.half && c.querySelector("svg.dg-half")) out.half = i;
  });
  return out;
});
console.log("候选格序号:", JSON.stringify(kinds));
const results = {};
for (const [name, idx] of Object.entries(kinds)) {
  if (idx === null) continue;
  const loc = page.locator(".dg-cell").nth(idx);
  await loc.scrollIntoViewIfNeeded();
  await sleep(300);
  const path = `docs/screenshots/v12/size-${name}.png`;
  await loc.screenshot({ path });
  const m = measurePng(path);
  console.log(`${name}: 彩色直径 ${m ? `${m.w}×${m.h}px（n=${m.n}）` : "未检出"}（DPR2，期望 52=26×2）`);
  results[name] = m;
}
await browser.close();
const ok = results.full && results.half && Math.abs(results.full.w - results.half.w) <= 2 && Math.abs(results.full.w - 52) <= 3;
console.log(ok ? "✓ 两种圆同径且=26px" : "✗ 仍有问题");
process.exit(ok ? 0 : 1);
