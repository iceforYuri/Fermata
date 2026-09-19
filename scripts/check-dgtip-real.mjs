// 真实 exe 内的悬停浮窗几何验收（CDP 直连 WebView2）
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
// 找主窗页面（含轨道）
const pages = ctx.pages();
const page = pages.find((p) => !p.url().includes("overlay")) ?? pages[0];
console.log("页面:", page.url());

await page.waitForSelector("[data-testid=tab-stats]", { timeout: 15000 });
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await page.waitForTimeout(800);
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const cellSel = `[data-testid=cal-cell][data-day="${ds}"]`;
if (await page.$(cellSel)) {
  await page.dblclick(cellSel);
} else {
  // 今天无格可双击就点胶囊的"日"
  await page.click("[data-testid=persp-day]").catch(() => {});
}
await page.waitForSelector("[data-testid=daygrid-scroll]", { timeout: 8000 });
await page.waitForTimeout(1500);

// 视口内找一颗圆
const box = await page.evaluate(() => {
  const dots = [...document.querySelectorAll(".dg-dot")];
  const el = dots.find((e) => {
    const r = e.getBoundingClientRect();
    return r.top > 140 && r.bottom < innerHeight - 140 && r.left > 40 && r.right < innerWidth - 40;
  });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!box) {
  console.log("FAIL：视口内找不到圆（可能今天无数据，看截图）");
  await page.screenshot({ path: "docs/screenshots/v12/dgtip-real.png" });
  process.exit(1);
}
await page.mouse.move(box.x, box.y, { steps: 4 });
await page.waitForTimeout(400);

const tip = await page.$("[data-testid=dg-tip]");
if (!tip) {
  console.log("FAIL：浮窗未出现");
  await page.screenshot({ path: "docs/screenshots/v12/dgtip-real.png" });
  process.exit(1);
}
const t = await tip.boundingBox();
const vw = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
const inView = t.x >= -1 && t.y >= -1 && t.x + t.width <= vw.w + 1 && t.y + t.height <= vw.h + 1;
console.log(`圆=(${Math.round(box.x)},${Math.round(box.y)}) 浮窗=(${Math.round(t.x)},${Math.round(t.y)}) 视口内=${inView}`);
console.log(inView ? "PASS" : "FAIL");
await page.screenshot({ path: "docs/screenshots/v12/dgtip-real.png" });
process.exit(inView ? 0 : 1);
