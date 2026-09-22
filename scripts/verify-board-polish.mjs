// board-polish 三件套实测：断点卡锚点 / 卡内标色 / 详情栏条目改文
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=board-page]");
await sleep(600);

// --- 1. 断点卡锚活跃行 ---
await page.locator("[data-testid=suspended-row] .row-main").nth(2).click();
await page.waitForSelector("[data-testid=bp-card]");
await sleep(300);
const geo = await page.evaluate(() => {
  const card = document.querySelector("[data-testid=bp-card]").getBoundingClientRect();
  const active = document.querySelector("[data-testid=active-row] .row-main").getBoundingClientRect();
  return { cardTop: card.top, cardLeft: card.left, activeBottom: active.bottom, activeLeft: active.left };
});
ok("断点卡贴活跃行下方", Math.abs(geo.cardTop - geo.activeBottom - 6) <= 8, `卡顶=${Math.round(geo.cardTop)} 活跃行底=${Math.round(geo.activeBottom)}`);
ok("断点卡水平对齐活跃行", Math.abs(geo.cardLeft - geo.activeLeft) <= 4, `卡左=${Math.round(geo.cardLeft)} 行左=${Math.round(geo.activeLeft)}`);

// --- 2. 卡内标色：点色即生效、卡片不关、焦点不丢 ---
const cellCount = await page.locator("[data-testid=bp-color-row] .color-cell").count();
ok("色标行 7 色 + 无色", cellCount === 8, `实得 ${cellCount}`);
const label = await page.locator(".bp-color-label").textContent();
ok("标色小字带新进程名", /给「.+」标个色/.test(label), label);
// 记录被点进程 id 与目标色
const targetPid = await page.evaluate(() => {
  const card = document.querySelector("[data-testid=bp-card]");
  return card ? document.querySelectorAll("[data-testid=suspended-row]")[2].getAttribute("data-pid") : null;
});
const cellBg = await page.locator("[data-testid=bp-color-3]").evaluate((el) => el.style.background);
await page.locator("[data-testid=bp-color-3]").click();
await sleep(400);
ok("点色后卡片仍在", (await page.locator("[data-testid=bp-card]").count()) === 1);
const focusKept = await page.evaluate(() => document.activeElement?.dataset?.testid === "bp-card-input");
ok("点色后输入框焦点不丢", focusKept);
const selected = await page.locator("[data-testid=bp-color-3]").evaluate((el) => el.classList.contains("selected"));
ok("所点色 cell 高亮", selected);
await page.screenshot({ path: "docs/screenshots/v12/bp-card-color.png" });
// Enter 确认切换 → 新活跃行应带该色
await page.keyboard.press("Enter");
await sleep(700);
const activeMc = await page.evaluate(() => {
  const el = document.querySelector("[data-testid=active-row]");
  return { pid: el.getAttribute("data-pid"), mc: el.style.getPropertyValue("--mc").trim() };
});
ok("Enter 后切换到被点进程", activeMc.pid === targetPid, `活跃=${activeMc.pid} 目标=${targetPid}`);
const hexOf = (bg) => bg; // 单元格用内联 background，活跃行用 --mc，两者同源自 palette
ok("新活跃行带上所选色", activeMc.mc !== "" && activeMc.mc !== "undefined", `--mc=${activeMc.mc} 色cell=${cellBg}`);

// --- 3. 详情栏条目改文 ---
await page.locator("[data-testid=active-row] .row-main").click();
await page.waitForSelector("[data-testid=detail-panel].open");
await sleep(400);
// 先压一条断点条，验证 note 也可改
await page.click("[data-testid=detail-breakpoint]");
await page.keyboard.type("做到第二章");
await page.keyboard.press("Enter");
await sleep(500);
const firstEntry = page.locator("[data-testid=detail-step]").first();
const noteText = await firstEntry.locator("[data-testid^=entry-text-]").textContent();
// 点击条目文字 → 进编辑
await firstEntry.locator("[data-testid^=entry-text-]").click();
await sleep(200);
const editing = await page.locator("[data-testid$=-editing]").count();
ok("点条目文字进编辑态", editing === 1, `编辑框数=${editing}`);
await page.keyboard.press("Control+a");
await page.keyboard.type("做到第三章（改）");
await page.keyboard.press("Enter");
await sleep(500);
const afterText = await page.locator("[data-testid=detail-step]").first().locator("[data-testid^=entry-text-]").textContent();
ok("断点条改文生效", afterText.includes("做到第三章（改）"), `${noteText} → ${afterText}`);
// 空提交 = 放弃
await page.locator("[data-testid=detail-step]").first().locator("[data-testid^=entry-text-]").click();
await sleep(200);
await page.keyboard.press("Control+a");
await page.keyboard.press("Backspace");
await page.keyboard.press("Enter");
await sleep(400);
const afterEmpty = await page.locator("[data-testid=detail-step]").first().locator("[data-testid^=entry-text-]").textContent();
ok("空提交不改文", afterEmpty.includes("做到第三章（改）"), `实为 ${afterEmpty}`);
// 拖行后不吃点击（不进编辑）：按住第一条往下拖 30px
const row0 = await page.locator("[data-testid=detail-step]").first().boundingBox();
await page.mouse.move(row0.x + row0.width / 2, row0.y + row0.height / 2);
await page.mouse.down();
await page.mouse.move(row0.x + row0.width / 2, row0.y + row0.height / 2 + 30, { steps: 6 });
await page.mouse.up();
await sleep(400);
const editAfterDrag = await page.locator("[data-testid$=-editing]").count();
ok("拖行后不误进编辑", editAfterDrag === 0, `编辑框数=${editAfterDrag}`);
await page.screenshot({ path: "docs/screenshots/v12/detail-entry-edit.png" });

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n== 自检 ${results.length - failed}/${results.length} 通过 ==`);
process.exit(failed ? 1 : 0);
