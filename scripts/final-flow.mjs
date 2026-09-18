// M4 收官：空库冷启动全流程（真实 tauri dev + CDP），逐幕截图 final-*.png
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "docs/screenshots/m4";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://localhost:9222");
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("14200") && !p.url().includes("window="));
if (!page) process.exit(1);
const inv = (cmd, args = {}) => page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await sleep(400);
  await page.screenshot({ path: `${OUT}/final-${name}.png` });
  console.log("[final]", name);
};

await page.waitForSelector("[data-testid=empty-state]", { timeout: 30000 });
await shot("empty");

// 新建两个进程（底部 + 号）
await page.fill("[data-testid=new-row-input]", "写 gika 收官清单");
await page.press("[data-testid=new-row-input]", "Enter");
await sleep(300);
await page.fill("[data-testid=new-row-input]", "读一遍宪法自查表");
await page.press("[data-testid=new-row-input]", "Enter");
await sleep(400);
await shot("created-suspended");

// 激活第一个（断点小卡留话）
await page.click("[data-testid=suspended-row] .row-main >> nth=0");
await page.waitForSelector("[data-testid=bp-card-input]");
await shot("breakpoint-card");
await page.press("[data-testid=bp-card-input]", "Enter");
await sleep(500);
await shot("running");

// 切换到第二个（带断点）
await page.click("[data-testid=suspended-row] .row-main >> nth=0");
await page.waitForSelector("[data-testid=bp-card-input]");
await page.fill("[data-testid=bp-card-input]", "清单写到第 3 条");
await page.press("[data-testid=bp-card-input]", "Enter");
await sleep(500);
await shot("switched");

// 完成当前（撤销 toast 闪现）
await page.click("[data-testid=active-row] [data-testid=confirm-spine]");
await shot("undo-toast");
await sleep(3400);
await shot("completed-folded");

// 档案
await page.click("[data-testid=donebar]");
await shot("archive");
await page.click("[data-testid=archive]", { position: { x: 20, y: 700 } });

// 统计
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await shot("stats");

// 设置
await page.click("[data-testid=tab-settings]");
await page.waitForSelector("[data-testid=settings-page]");
await shot("settings");

// 回进程页
await page.click("[data-testid=tab-board]");
await sleep(400);

const board = await inv("q_board", { day: new Date().toLocaleDateString("sv-SE") });
console.log("[final] 版面状态:", JSON.stringify({
  running: board.running?.process.title ?? null,
  suspended: board.suspended.length,
  completed: board.completed.length,
}));
await browser.close();
console.log("[final] done");
