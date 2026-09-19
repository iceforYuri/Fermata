// v1.1 截图矩阵 → docs/screenshots/v11/（亮·淡暖为主，暗版抽查，A/B 封版三值）
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:14200";
const OUT = "docs/screenshots/v11";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await sleep(350);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("[shot]", name);
};

// 主版面（rail 收起态，胶囊导航）
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await shot("board-capsule");
await shot("rail-closed");

// 胶囊 hover 态
await page.hover("[data-testid=tab-stats]");
await shot("capsule-hover");

// rail 展开态
await page.click("[data-testid=lib-rail]");
await page.waitForTimeout(400);
await shot("rail-open");
await page.click("[data-testid=lib-rail]");

// 详情栏：空圈步骤栈（顶部幽灵行）
await page.click("[data-testid=active-row] .row-main");
await page.waitForTimeout(500);
await shot("detail-step-stack");
await page.click("[data-testid=detail-close]");

// 统计：日滚动两相邻天（吸顶日期头）
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=stats-page]");
await page.waitForSelector("[data-testid=month-cal]");
await shot("stats-month");
const today = new Date();
const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(600);
await shot("day-scroll-today");
// 滚一天上去（相邻天）
await page.evaluate(() => {
  const sc = document.querySelector("[data-testid=daygrid-scroll]");
  sc.scrollTop -= 480;
});
await sleep(600);
await shot("day-scroll-prev");

// 休息页（淡暖）
await page.goto(`${BASE}/?fixture=rest`);
await page.waitForSelector("[data-testid=rest-page]");
await shot("rest-light");

// 暗版抽查
await page.goto(`${BASE}/?theme=dark`);
await page.waitForSelector("[data-testid=board-page]");
await shot("board-dark");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await shot("stats-month-dark");

// A/B 封版三值：同版面三张
for (const paper of ["FCFBF7", "FCFCFA", "FBFAF7"]) {
  await page.goto(`${BASE}/?paper=${paper}`);
  await page.waitForSelector("[data-testid=board-page]");
  await shot(`ab-paper-${paper}`);
}

await browser.close();
console.log("[shot] v11 done");
