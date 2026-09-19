// 日网格悬停浮窗几何可见性自检（轨道 transform 环境下 fixed/portal 定位）
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:14200";
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await page.waitForTimeout(800);

// 找一颗当前就在视口内（避开顶/底遮罩带）的圆，真实鼠标悬停
const handle = await page.evaluateHandle(() => {
  const dots = [...document.querySelectorAll(".dg-dot")];
  return dots.find((el) => {
    const r = el.getBoundingClientRect();
    return r.top > 120 && r.bottom < innerHeight - 120 && r.width > 0;
  }) ?? null;
});
if (!handle.asElement()) {
  console.log("FAIL：视口内没有可悬停的圆");
  process.exit(1);
}
const cell = await handle.asElement().boundingBox();
await page.mouse.move(cell.x + cell.width / 2, cell.y + cell.height / 2, { steps: 4 });
await page.waitForTimeout(300);

const tip = await page.$("[data-testid=dg-tip]");
if (!tip) {
  console.log("FAIL：浮窗未出现");
  process.exit(1);
}
const t = await tip.boundingBox();
const inViewport = t.x >= -1 && t.y >= -1 && t.x + t.width <= 1281 && t.y + t.height <= 951;
const near = Math.abs(t.x - cell.x) < 300 && Math.abs(t.y + t.height - cell.y) < 80;
const text = await tip.textContent();
console.log(`圆心=(${Math.round(cell.x)},${Math.round(cell.y)}) 浮窗=(${Math.round(t.x)},${Math.round(t.y)} ${Math.round(t.width)}x${Math.round(t.height)})`);
console.log(`视口内=${inViewport} 贴近圆圈=${near} 内容="${text.slice(0, 40)}"`);
console.log(inViewport && near ? "PASS" : "FAIL");
await page.screenshot({ path: "docs/screenshots/v12/daygrid-hover.png" });
await browser.close();
process.exit(inViewport && near ? 0 : 1);
