// v1.2 截图矩阵 → docs/screenshots/v12/
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:14200";
const OUT = "docs/screenshots/v12";
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

// morph 导航：选中态（进程）
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await sleep(700); // 弹簧落定
await shot("nav-morph-board");

// morph 导航：选中态（统计）+ 弹簧中段帧
await page.click("[data-testid=tab-stats]");
await sleep(120); // 弹簧中段
await shot("nav-morph-mid");
await page.waitForSelector("[data-testid=stats-page]");
await sleep(500);
await shot("nav-morph-stats");

// rail 常驻提示 + 收起态
await page.click("[data-testid=tab-board]");
await page.waitForSelector("[data-testid=board-page]");
await sleep(500);
await shot("rail-hint");

// 详情栏统一栈（断点条 ▸ + 步骤空圈 + 条目 ×）
await page.click("[data-testid=active-row] .row-main");
await page.waitForSelector("[data-testid=detail-panel].open");
await sleep(400);
await shot("detail-unified-stack");
await page.click("[data-testid=detail-close]");

// 休息页：继续小字 + Esc 提示
await page.goto(`${BASE}/?fixture=rest`);
await page.waitForSelector("[data-testid=rest-page]");
await shot("rest-continue");

// 设置页左竖导航
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.click("[data-testid=tab-settings]");
await page.waitForSelector("[data-testid=settings-page]");
await sleep(400);
await shot("settings-leftnav");

// 日网格：时间段刻度 + 半圆
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(700);
await shot("daygrid-half-circles");

// 拖拽中段：挤位 + 落点虚影帧
await page.click("[data-testid=tab-board]");
await page.waitForSelector("[data-testid=board-page]");
await sleep(400);
const rows = await page.$$eval("[data-testid=suspended-row]", (els) => els.map((e) => e.dataset.pid));
const box = await page.locator(`[data-testid=suspended-row][data-pid="${rows[rows.length - 1]}"]`).boundingBox();
const qTop = await page.evaluate(() => document.querySelector("[data-testid=suspended-queue]").getBoundingClientRect().top);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, qTop + 40, { steps: 10 });
await sleep(250);
await page.screenshot({ path: `${OUT}/drag-ghost-frame.png` });
console.log("[shot] drag-ghost-frame");
await page.mouse.up();

await browser.close();
console.log("[shot] v12 done");
