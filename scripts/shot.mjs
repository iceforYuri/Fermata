// M1 通用截图器：路由 × fixture × 状态 矩阵 → docs/screenshots/m1/
// 用法：先起 `pnpm vite dev`（mock 模式），再 `node scripts/shot.mjs`
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:14200";
const OUT = "docs/screenshots/m1";
const OUT2 = "docs/screenshots/m2";
const OUT3 = "docs/screenshots/m3";
mkdirSync(OUT3, { recursive: true });
mkdirSync(OUT2, { recursive: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("console", (m) => m.type() === "error" && console.log("[console.error]", m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

async function shot(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("[shot]", name);
}
async function shot2(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT2}/${name}.png` });
  console.log("[shot]", name);
}
async function shot3(name) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT3}/${name}.png` });
  console.log("[shot]", name);
}

// 丰富态主版面
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await shot("board-rich");

// 详情栏开
await page.click("[data-testid=active-row] .row-main");
await shot("board-detail-open");
await page.click("[data-testid=detail-close]");

// 稿库开
await page.click("[data-testid=lib-toggle]");
await shot("board-library-open");
await page.click("[data-testid=lib-toggle]");

// 完成档案开
await page.click("[data-testid=donebar]");
await shot("archive-open");
await page.click("[data-testid=archive]", { position: { x: 20, y: 700 } });

// 空态
await page.goto(`${BASE}/?fixture=empty`);
await page.waitForSelector("[data-testid=empty-state]");
await shot("board-empty");

// 休息态
await page.goto(`${BASE}/?fixture=rest`);
await page.waitForSelector("[data-testid=rest-page]");
await shot("board-rest");

// 撤销 toast 瞬间（点确认条 → 3s 内）
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=active-row]");
await page.click("[data-testid=active-row] [data-testid=confirm-spine]");
await page.waitForSelector("[data-testid=undo-toast]");
await page.screenshot({ path: `${OUT}/undo-toast.png` });
console.log("[shot] undo-toast");

// 暗主题一轮
await page.goto(`${BASE}/?theme=dark`);
await page.waitForSelector("[data-testid=board-page]");
await shot("board-dark");

await page.goto(`${BASE}/?fixture=rest&theme=dark`);
await page.waitForSelector("[data-testid=rest-page]");
await shot("board-rest-dark");

// M2 浮层各态（mock 路由）
await page.goto(`${BASE}/#/overlay/switcher`);
await page.waitForSelector("[data-testid=switcher]");
await shot2("overlay-switcher");

// 浮层过滤态
await page.fill("[data-testid=switcher-input]", "周报");
await shot2("overlay-switcher-filter");

// 浮层断点变形态（Enter 进入断点内嵌）
await page.fill("[data-testid=switcher-input]", "");
await page.press("[data-testid=switcher-input]", "Enter");
await page.waitForSelector("[data-testid=switcher-bp-input]");
await shot2("overlay-switcher-breakpoint");

// 休止符三选（fixture=rest 使 rest 状态可见：先用默认态展示三选）
await page.goto(`${BASE}/#/overlay/restpop`);
await page.waitForSelector("[data-testid=restpop]");
await shot2("overlay-restpop-choice");

// 翻下一篇展开
await page.click("[data-testid=rest-next]");
await shot2("overlay-restpop-next");

// 休息态（弹窗原地变形）
await page.goto(`${BASE}/?fixture=rest#/overlay/restpop`);
await page.waitForSelector("[data-testid=restpop]");
await page.click("[data-testid=rest-confirm]");
await page.waitForTimeout(400);
await shot2("overlay-restpop-resting");

// 空闲回归确认卡（mock 下手动触发：直接渲染组件需事件——用键盘不可行，跳过；主窗内卡片由空闲事件驱动，见 verify-m2）
// M3 统计页矩阵
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await page.waitForTimeout(500);
await shot3("stats-month");

// 大环+图例+核心数字（今天）
await shot3("stats-bigring-today");

// 当天视图四组（滚到底）
await page.evaluate(() => {
  document.querySelector("[data-testid=dayview]")?.scrollIntoView({ block: "start" });
});
await shot3("stats-dayview");

// 日网格（今天，本地日期）
const _d = new Date();
const _today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${_today}"]`);
await page.waitForSelector("[data-testid=daygrid]");
await shot3("stats-daygrid-today");

// 悬停浮窗
const dot = await page.$("[data-testid=dg-dot]");
if (dot) { await dot.hover(); await shot3("stats-daygrid-hover"); }

// 空天（昨天往前找无数据天）——用一个确定无记录的过去日：直接换天到上月1日大概率空
await page.click("[data-testid=daygrid-date]");
await page.waitForSelector("[data-testid=month-cal]");
await shot3("stats-month-after-drill");

// 年视图
await page.click("[data-testid=capsule-year]");
await page.waitForSelector("[data-testid=yearview]");
await shot3("stats-year");

// 暗主题一轮
await page.goto(`${BASE}/?theme=dark`);
await page.waitForSelector("[data-testid=board-page]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await shot3("stats-month-dark");

await browser.close();
console.log("[shot] done");
