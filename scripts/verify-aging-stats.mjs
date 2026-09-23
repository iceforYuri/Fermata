// aging-stats-detail 验收：老化双轴 / 点击同开详情栏 / 未做完+补登 / 详情玻璃卡+回归
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };
const SHOT = "docs/screenshots/v13";

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=board-page]");
await sleep(800);

// ---------- A · 老化双轴 ----------
// 种子：回三封邮件 4.2h（触底）、写周报 2.9h、读书 1.3h、等AI（不褪不沉）
const rows = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid=suspended-row]")].map((el) => ({
    pid: el.getAttribute("data-pid"),
    state: el.getAttribute("data-state"),
    title: el.querySelector(".suspended-title").textContent,
    ageOp: el.style.getPropertyValue("--age-op").trim(),
    ageInk: el.style.getPropertyValue("--age-ink").trim(),
    titleOpacity: getComputedStyle(el.querySelector(".suspended-title")).opacity,
    labelOpacity: getComputedStyle(el.querySelector(".aging-label")).opacity,
    rowOpacity: getComputedStyle(el).opacity,
  })),
);
console.log("rows:", JSON.stringify(rows, null, 1));
const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
const near = (a, b, eps = 0.03) => Math.abs(Number(a) - b) <= eps;
ok("触底行（4.2h）：标题 0.45 / 标签 1.0（反差拉满）",
  near(byTitle["回三封邮件"].titleOpacity, 0.45) && near(byTitle["回三封邮件"].labelOpacity, 1),
  `标题=${byTitle["回三封邮件"].titleOpacity} 标签=${byTitle["回三封邮件"].labelOpacity}`);
ok("中行（2.9h）：标题≈0.60 / 标签≈0.83",
  near(byTitle["写周报"].titleOpacity, 0.6) && near(byTitle["写周报"].labelOpacity, 0.83),
  `标题=${byTitle["写周报"].titleOpacity} 标签=${byTitle["写周报"].labelOpacity}`);
ok("浅行（1.3h）：标题≈0.82 / 标签≈0.58",
  near(byTitle["读《形式的起源》第 4 章"].titleOpacity, 0.82) && near(byTitle["读《形式的起源》第 4 章"].labelOpacity, 0.58));
ok("等AI：不褪（1）不沉（0.38）",
  near(byTitle["等 AI 跑财报数据"].titleOpacity, 1) && near(byTitle["等 AI 跑财报数据"].labelOpacity, 0.38));
ok("行级 opacity 恒 1（褪色已拆轴）", rows.every((r) => r.rowOpacity === "1"));

// hover 复活：读书行悬停 → 标题回 1，标签保持 0.58 不动
await page.locator("[data-testid=suspended-row]", { hasText: "读《形式的起源》第 4 章" }).first().hover();
await sleep(400);
const hov = await page.evaluate(() => {
  const el = [...document.querySelectorAll("[data-testid=suspended-row]")].find((x) => x.querySelector(".suspended-title").textContent.includes("形式的起源"));
  return {
    title: getComputedStyle(el.querySelector(".suspended-title")).opacity,
    label: getComputedStyle(el.querySelector(".aging-label")).opacity,
  };
});
ok("hover 复活标题（→1）不及标签（保持≈0.58）", near(hov.title, 1) && near(hov.label, 0.58, 0.05),
  `hover后 标题=${hov.title} 标签=${hov.label}`);
await page.mouse.move(40, 300);
await page.screenshot({ path: `${SHOT}/aging-dual-axis.png` });

// ---------- B · 点击同开详情栏 ----------
const target = rows.find((r) => r.title === "写周报");
await page.locator(`[data-testid=suspended-row][data-pid="${target.pid}"] .row-main`).click();
await page.waitForSelector("[data-testid=bp-card]");
await page.waitForSelector("[data-testid=detail-panel].open");
await sleep(300);
const detailTitle = await page.locator("[data-testid=detail-panel] [data-testid=detail-title]").textContent();
ok("点击挂起行：断点卡 + 详情栏同开，详情钉被点进程", detailTitle.includes("写周报"), `详情标题=${detailTitle}`);
await page.screenshot({ path: `${SHOT}/click-opens-detail.png` });
await page.keyboard.press("Escape");
await sleep(300);
ok("Esc 收卡后详情栏仍留", (await page.locator("[data-testid=detail-panel].open").count()) === 1);
await page.locator("[data-testid=detail-close]").click();
await sleep(200);

// ---------- 注入：把「写周报」移到昨天（造未做完） ----------
const yesterday = await page.evaluate((pid) => {
  const m = window.__mock;
  const p = m.processes.find((x) => x.id === Number(pid));
  const d = new Date(Date.now() - 86400000);
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  p.board_date = ds;
  return ds;
}, target.pid);
console.log("写周报 → board_date =", yesterday);
await sleep(1200); // 等 1Hz tick 让 DayViewSection 重取

// ---------- C · 未做完 + 色脊补登 ----------
await page.click("[data-testid=tab-stats]");
await sleep(700);
await page.click(`[data-testid=cal-cell][data-day="${yesterday}"]`);
await sleep(900);
const label = await page.locator("[data-testid=dv-ongoing] .detail-label").textContent();
ok("非今天：进行中区改名「未做完」", label === "未做完", `区名=${label}`);
const ongoingRow = page.locator("[data-testid=dv-ongoing-row]", { hasText: "写周报" });
ok("未做完行出现（写周报）", (await ongoingRow.count()) === 1);
await page.screenshot({ path: `${SHOT}/not-done-yesterday.png` });
await ongoingRow.locator("[data-testid=dv-spine-complete]").click();
await page.waitForSelector("[data-testid=undo-toast]");
ok("补登完成：3s 撤销 toast 出现", true);
await page.screenshot({ path: `${SHOT}/retroactive-complete-toast.png` });
await sleep(1300);
const doneHas = await page.locator("[data-testid=dv-done-row]", { hasText: "写周报" }).count();
ok("补登后行进「已做」", doneHas === 1);
// 走真实撤销通路还原，供 D 用（toast 3s 窗内）
await page.click("[data-testid=undo-btn]");
await sleep(1300);
const backToUndone = await page.locator("[data-testid=dv-ongoing-row]", { hasText: "写周报" }).count();
ok("撤销后行回「未做完」", backToUndone === 1);

// ---------- D · 详情玻璃卡 + 回归（计划化） ----------
await page.locator("[data-testid=dv-ongoing-row]", { hasText: "写周报" }).click();
await page.waitForSelector("[data-testid=stats-detail]");
await sleep(500);
const sdTitle = await page.locator("[data-testid=sd-title]").textContent();
const hasPlanBtns =
  (await page.locator("[data-testid=sd-plan-today]").count()) === 1 &&
  (await page.locator("[data-testid=sd-plan-cal]").count()) === 1;
ok("详情玻璃卡：回归区 = 放到今天稿库 / 选一天…", sdTitle.includes("写周报") && hasPlanBtns,
  `标题=${sdTitle}`);
await page.screenshot({ path: `${SHOT}/stats-detail-card.png` });

await page.click("[data-testid=sd-plan-cal]");
await page.waitForSelector("[data-testid=plan-cal]");
const cells = await page.evaluate((yd) => {
  const td = new Date(); const t = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, "0")}-${String(td.getDate()).padStart(2, "0")}`;
  const all = [...document.querySelectorAll("[data-testid=plan-cal-cell]")];
  return {
    total: all.length,
    past: all.filter((c) => c.classList.contains("past")).length,
    yesterdayPast: all.find((c) => c.getAttribute("data-day") === yd)?.classList.contains("past") ?? null,
    todayNotPast: !all.find((c) => c.getAttribute("data-day") === t)?.classList.contains("past"),
  };
}, yesterday);
ok("回归日历：过去置灰、今天可选", cells.yesterdayPast === true && cells.todayNotPast, JSON.stringify(cells));
await page.screenshot({ path: `${SHOT}/regather-calendar.png` });
await page.click("[data-testid=plan-cal-back]");
await sleep(250);

await page.click("[data-testid=sd-plan-today]");
await sleep(900);
ok("放到今天稿库后卡片收起", (await page.locator("[data-testid=stats-detail]").count()) === 0);
const planMade = await page.evaluate(() => {
  const m = window.__mock;
  const d = new Date();
  const t = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const p = m.plans.find((x) => x.title === "写周报" && x.scheduled_date === t && x.state === "pool");
  return p ? { id: p.id, scheduled_date: p.scheduled_date } : null;
});
ok("计划已生成（同名、预定日=今天、pool）", !!planMade, JSON.stringify(planMade));
await sleep(1300); // DayViewSection 1Hz 重取
const stillThere = await page.locator("[data-testid=dv-ongoing-row]", { hasText: "写周报" }).count();
ok("源进程原地封存：昨天「未做完」仍在（历史不改写）", stillThere === 1);

// 回进程页：版面上没有它（回归进的是稿库，不是版面）；稿库今日组应有
await page.click("[data-testid=tab-board]");
await sleep(1200);
const onBoard = await page.locator("[data-testid=suspended-row]", { hasText: "写周报" }).count();
ok("进程页版面没有「写周报」（不搬进程）", onBoard === 0);
const inLib = await page.evaluate(() => {
  const m = window.__mock;
  const d = new Date();
  const t = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return m.plans.some((x) => x.title === "写周报" && x.scheduled_date === t && x.state === "pool");
});
ok("稿库（今日剩余组数据源）有这条计划", inLib);
await page.screenshot({ path: `${SHOT}/plan-not-on-board.png` });

console.log(`\n${results.filter(Boolean).length}/${results.length} 通过`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
