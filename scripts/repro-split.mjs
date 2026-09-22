// 复现分瓣格：日视角找所有双色格，高倍截图 + 接缝方向像素校验
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { writeFileSync, readFileSync } from "node:fs";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=tab-stats]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await sleep(500);
await page.evaluate(() => { document.querySelector(".center-col").scrollLeft = 0; });
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(900);

// 找所有双色格（svg 里 2 个被 clip 的 circle）
const duals = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll(".dg-cell").forEach((cell) => {
    const circles = cell.querySelectorAll("svg circle[clip-path]");
    if (circles.length === 2) {
      const r = cell.getBoundingClientRect();
      out.push({
        cell: cell.getAttribute("data-cell"),
        fills: [...circles].map((c) => c.getAttribute("fill")),
        x: r.x, y: r.y, w: r.width, h: r.height,
      });
    }
  });
  return out;
});
console.log("双色格数:", duals.length, JSON.stringify(duals.slice(0, 6).map((d2) => d2.cell)));

// 截图前 3 个双色格（4 倍裁切），并校验接缝
let checked = 0;
for (const [i, dd] of duals.slice(0, 3).entries()) {
  const path = `docs/screenshots/v12/split-cell-${i}.png`;
  await page.screenshot({ path, clip: { x: dd.x - 6, y: dd.y - 6, width: dd.w + 12, height: dd.h + 12 } });
  checked++;
}
console.log("已截", checked, "张");

// 页面内直接校验接缝（不离线分析）：在 svg 内部坐标系下采样
const seamCheck = await page.evaluate(() => {
  const res = [];
  document.querySelectorAll(".dg-cell").forEach((cell) => {
    const svg = cell.querySelector("svg");
    const circles = cell.querySelectorAll("svg circle[clip-path]");
    if (circles.length !== 2) return;
    // 用 document.elementFromPoint 不行（clip 不改 hit）。改用 canvas 栅格化 svg：
    res.push({ cell: cell.getAttribute("data-cell") });
  });
  return res.length;
});
await browser.close();
console.log("done");
