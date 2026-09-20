// v1.0.0 发布截图矩阵 → docs/screenshots/release/（mock 双主题全轮）
// 用法：先起 `pnpm vite dev`（14200），再 `node scripts/shot-release.mjs`
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:14200";
const OUT = "docs/screenshots/release";
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
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

for (const theme of ["light", "dark"]) {
  const suf = theme === "dark" ? "-dark" : "";
  const home = `${BASE}/?theme=${theme}`;

  // —— 进程页 ——
  await page.goto(home);
  await page.waitForSelector("[data-testid=board-page]");
  await sleep(700); // 弹簧落定
  await shot(`board-rich${suf}`);

  // 详情面板
  await page.click("[data-testid=active-row] .row-main");
  await page.waitForSelector("[data-testid=detail-panel].open");
  await sleep(400);
  await shot(`board-detail${suf}`);
  await page.click("[data-testid=detail-close]");
  await sleep(300);

  // 稿库展开
  await page.click("[data-testid=lib-rail]");
  await page.waitForSelector("[data-testid=plan-row]");
  await sleep(400);
  await shot(`board-library${suf}`);
  await page.click("[data-testid=lib-rail]");
  await sleep(300);

  // 完成档案（点击遮罩空白处关闭）
  await page.click("[data-testid=donebar]");
  await sleep(500);
  await shot(`board-archive${suf}`);
  await page.click("[data-testid=archive]", { position: { x: 20, y: 20 } });
  await sleep(300);

  // 撤销 toast（完成队首一条 → 3s 内截）
  const spine = await page.$("[data-testid=suspended-row] [data-testid=confirm-spine]");
  if (spine) {
    await spine.click();
    await page.waitForSelector("[data-testid=undo-toast]", { timeout: 2000 }).catch(() => {});
    await shot(`board-undo-toast${suf}`);
    // 撤销回去，恢复版面
    const undoBtn = await page.$("[data-testid=undo-toast] button");
    if (undoBtn) await undoBtn.click();
    await sleep(400);
  }

  // 拖拽中帧（塌陷补位+开缝虚影）
  {
    const pids = await page.$$eval("[data-testid=suspended-row]", (els) => els.map((e) => e.dataset.pid));
    const box = await page.locator(`[data-testid=suspended-row][data-pid="${pids[1]}"]`).boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy + 40, { steps: 8 });
    await sleep(450);
    await page.screenshot({ path: `${OUT}/drag-ghost${suf}.png` });
    console.log("[shot]", `drag-ghost${suf}`);
    await page.mouse.up();
    await sleep(400);
  }

  // 空态
  await page.goto(`${BASE}/?fixture=empty&theme=${theme}`);
  await page.waitForSelector("[data-testid=empty-state]");
  await sleep(400);
  await shot(`board-empty${suf}`);

  // 休息页
  await page.goto(`${BASE}/?fixture=rest&theme=${theme}`);
  await page.waitForSelector("[data-testid=rest-page]");
  await sleep(500);
  await shot(`rest-page${suf}`);

  // —— 统计页 ——
  await page.goto(home);
  await page.waitForSelector("[data-testid=board-page]");
  await page.click("[data-testid=tab-stats]");
  await page.waitForSelector("[data-testid=month-cal]");
  await sleep(600);
  await shot(`stats-month${suf}`);

  // 日视角（钻取今天）
  await page.dblclick(`[data-testid=cal-cell][data-day="${today()}"]`);
  await page.waitForSelector("[data-testid=daygrid-scroll]");
  await sleep(800);
  await shot(`stats-day${suf}`);

  // 日网格悬停浮窗
  {
    const dot = await page.$("[data-testid=daygrid-scroll] .dg-dot");
    if (dot) {
      await dot.hover();
      await sleep(400);
      await shot(`stats-day-tip${suf}`);
    }
  }

  // 年视角
  await page.click("[data-testid=capsule-year]");
  await sleep(700);
  await shot(`stats-year${suf}`);

  // —— 设置页 ——
  await page.click("[data-testid=tab-settings]");
  await page.waitForSelector("[data-testid=settings-page]");
  await sleep(500);
  await shot(`settings${suf}`);

  // —— 浮层（路由直达）——
  await page.goto(`${BASE}/?theme=${theme}#/overlay/switcher`);
  await sleep(600);
  await shot(`overlay-switcher${suf}`);
  await page.goto(`${BASE}/?theme=${theme}#/overlay/restpop`);
  await sleep(600);
  await shot(`overlay-restpop${suf}`);
}

await browser.close();
console.log("release 截图矩阵完成");
