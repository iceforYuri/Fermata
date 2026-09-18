// M1 通用截图器：路由 × fixture × 状态 矩阵 → docs/screenshots/m1/
// 用法：先起 `pnpm vite dev`（mock 模式），再 `node scripts/shot.mjs`
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:14200";
const OUT = "docs/screenshots/m1";
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

await browser.close();
console.log("[shot] done → docs/screenshots/m1/");
