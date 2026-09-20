// M3 v1.1 验证（mock）：视角钻取 / 锚点保留 / 日视角纵向滚动 / 归属规则 / 未计时完成 / 回到今天
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:14200";
const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const todayStr = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=stats-page]");
await page.waitForSelector("[data-testid=month-cal]");
await page.waitForTimeout(500);

// 1. 默认月视角锚定今天
ok("默认月视角锚定今天", !!(await page.$(`[data-testid=cal-cell][data-day="${todayStr()}"].selected`)));

// 2. 月单击=选中不跳页；双击=日视角
const cells = await page.$$("[data-testid=cal-cell]:not(.blank):not(.future)");
const target = cells[cells.length - 8] ?? cells[0];
const targetDay = await target.getAttribute("data-day");
await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
await target.click();
await sleep(300);
ok(
  "月单击=选中不跳页",
  (await page.$(`[data-testid=cal-cell][data-day="${targetDay}"].selected`)) !== null &&
    (await page.$("[data-testid=daygrid-scroll]")) === null,
);
await target.dblclick();
await page.waitForSelector("[data-testid=daygrid-scroll]");
await page.waitForTimeout(400);
ok(
  "双击→日视角（滚到该天）",
  !!(await page.$(`.day-unit[data-day="${targetDay}"]`)),
);

// 3. 日视角纵向滚动：滚到底=今天，静止后锚点联动
await page.evaluate(() => {
  const sc = document.querySelector("[data-testid=daygrid-scroll]");
  sc.scrollTop = sc.scrollHeight;
});
await sleep(700);
const units = await page.$$eval(".day-unit", (els) => els.map((e) => e.dataset.day));
ok("日滚动：上界有记录日、下界今天", units[units.length - 1] === todayStr() && !units.some((d) => d > todayStr()));

// 4. 吸顶日期头点击回月视角，且锚点=今天（滚动联动生效）
await page.click(`.day-unit[data-day="${todayStr()}"] .day-big-label`);
await page.waitForSelector("[data-testid=month-cal]");
ok(
  "点吸顶日期回月 + 滚动锚点联动（今天）",
  !!(await page.$(`[data-testid=cal-cell][data-day="${todayStr()}"].selected`)),
);

// 5. 切视角锚点保留（月→年→月）
await page.click("[data-testid=capsule-year]");
await page.waitForSelector("[data-testid=yearview]");
const monthCells = await page.$$("[data-testid=year-month]:not(.empty)");
ok("年视图有月环", monthCells.length > 0, `${monthCells.length} 个月`);
const mLabel = await monthCells[monthCells.length - 1].getAttribute("data-month");
await monthCells[monthCells.length - 1].click();
await page.waitForSelector("[data-testid=month-cal]");
const monthTitle = await page.textContent(".stats-month-title");
ok("年点月环→月（月份正确）", monthTitle.includes(`${Number(mLabel)} 月`), monthTitle.trim());

// 6. 大环总专注显示 + 回到今天
await page.click(`[data-testid=cal-cell][data-day="${targetDay}"]`);
await sleep(400);
const totalShown = await page.textContent(".bigring-nums .big-num");
ok("大环总专注显示", !!totalShown && totalShown.length > 0, totalShown?.trim());
await page.click("[data-testid=back-today]");
await sleep(300);
ok("回到今天", !!(await page.$(`[data-testid=cal-cell][data-day="${todayStr()}"].selected`)));

// 7. 日网格圆圈 + 悬停浮窗（滚到今天那格）
await page.dblclick(`[data-testid=cal-cell][data-day="${todayStr()}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(800);
const dots = await page.$$("[data-testid=dg-dot]");
ok("日网格今天有圆圈", dots.length > 0, `${dots.length} 格（108 格网）`);
  const cellCount = await page.evaluate(() => [...document.querySelectorAll(".day-unit")].map(u => u.querySelectorAll(".dg-cell").length).find(n => n > 0) ?? 0);
  ok("日网格 18×6=108 格", cellCount === 108, `cells=${cellCount}`);
const dotsToday = dots.length;
await dots[dots.length - 1].hover();
await sleep(300);
const tip = await page.textContent("[data-testid=dg-tip]");
ok("悬停浮窗（进程名+起止+时长）", /\d{2}:\d{2}–(\d{2}:\d{2}|进行中)/.test(tip), tip.trim().slice(0, 60));
await page.mouse.move(24, 100);

// 7b. 浮窗内容完整（进程名+起止+时长）+ 大圆 26px + 单元间距 72px + 钻取零漂移
{
  // 取倒数第二个格（最末格可能是进行中开口段）
  const dot0 = page.locator("[data-testid=dg-dot]").nth(-2);
  await dot0.hover();
  await sleep(300);
  const tipText = await page.textContent("[data-testid=dg-tip]");
  const dotBox = await dot0.boundingBox();
  ok(
    "浮窗含进程名+起止+时长",
    (/\d{2}:\d{2}–(\d{2}:\d{2}|进行中)/.test(tipText)) && tipText.trim().length > 8,
    tipText.trim().slice(0, 50),
  );
  ok("圆加大 26px", Math.abs(dotBox.width - 26) < 1, `w=${dotBox.width}`);

  const gapInfo = await page.evaluate(() => {
    const units = [...document.querySelectorAll(".day-unit")].slice(0, 3);
    if (units.length < 2) return null;
    const a = units[0].getBoundingClientRect();
    const b = units[1].getBoundingClientRect();
    return Math.round(b.top - a.bottom);
  });
  ok("日单元间距 72px", gapInfo !== null && Math.abs(gapInfo - 72) <= 2, `gap=${gapInfo}`);
}

// 7c. 钻取零漂移：双击进日视角，动画期间锚日 y 不漂
{
  await page.click(`.day-unit[data-day="${todayStr()}"] .day-big-label`);
  await page.waitForSelector("[data-testid=month-cal]");
  await page.waitForTimeout(400);
  const dayPos = () => page.evaluate((d) => {
    const sc = document.querySelector("[data-testid=daygrid-scroll]");
    const el = sc?.querySelector(`.day-unit[data-day="${d}"]`);
    if (!sc || !el) return null;
    return Math.round(el.getBoundingClientRect().top - sc.getBoundingClientRect().top);
  }, todayStr());
  await page.dblclick(`[data-testid=cal-cell][data-day="${todayStr()}"]`);
  await sleep(60); // 动画早期
  const y1 = await dayPos();
  await sleep(220); // 动画后
  const y2 = await dayPos();
  ok("钻取零漂移（锚日 y 恒定）", y1 !== null && y1 === y2, `t60ms=${y1} t280ms=${y2}`);
}

// 8. 未计时完成不画圈：今天加计划并直接完成 → 圆圈数不变
await page.click(`.day-unit[data-day="${todayStr()}"] .day-big-label`);
await page.waitForSelector("[data-testid=month-cal]");
await page.click(`[data-testid=cal-cell][data-day="${todayStr()}"]`);
await page.waitForSelector("[data-testid=dayview]");
await page.fill("[data-testid=dv-plan-input]", "未计时完成验收项");
await page.press("[data-testid=dv-plan-input]", "Enter");
await sleep(400);
const row = page.locator("[data-testid=dv-plan-row]", { hasText: "未计时完成验收项" });
await row.locator("[data-testid=dv-plan-done]").click();
await sleep(400);
const doneTag = await row.textContent();
await page.dblclick(`[data-testid=cal-cell][data-day="${todayStr()}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(800);
const dotsAfter = (await page.$$("[data-testid=dg-dot]")).length;
ok("未计时完成标记出现且不画圈", doneTag.includes("未计时完成") && dotsAfter === dotsToday, `${dotsToday}→${dotsAfter}`);

// 8b. 计划四修：编辑提交/Esc、完成划线、↩放回稿库、删除即消失
{
  // 重回当天视图
  await page.click(`.day-unit[data-day="${todayStr()}"] .day-big-label`);
  await page.waitForSelector("[data-testid=month-cal]");
  await page.click(`[data-testid=cal-cell][data-day="${todayStr()}"]`);
  await page.waitForSelector("[data-testid=dayview]");
  await sleep(300);

  // ① pool 态标题双态编辑：Esc 还原
  const poolRow = page.locator("[data-testid=dv-plan-row][data-state=pool]").first();
  const oldTitle = (await poolRow.locator(".dv-plan-title").textContent()).trim();
  await poolRow.locator("[data-testid=dv-plan-title]").click();
  await poolRow.locator("[data-testid=dv-plan-title-editing]").waitFor();
  await poolRow.locator("[data-testid=dv-plan-title-editing]").fill("不应出现的名字");
  await page.keyboard.press("Escape");
  await sleep(300);
  const afterEsc = (await poolRow.locator(".dv-plan-title").textContent()).trim();
  ok("计划编辑 Esc 还原", afterEsc === oldTitle, `esc=${afterEsc} 期望 ${oldTitle}`);

  // ② Enter 提交改名
  await poolRow.locator("[data-testid=dv-plan-title]").click();
  await poolRow.locator("[data-testid=dv-plan-title-editing]").waitFor();
  await poolRow.locator("[data-testid=dv-plan-title-editing]").fill("改名后的计划");
  await page.keyboard.press("Enter");
  await sleep(400);
  const renamed = (await page.locator("[data-testid=dv-plan-row][data-state=pool]", { hasText: "改名后的计划" }).count()) === 1;
  ok("计划编辑 Enter 提交", renamed, "");

  // ③ 完成态：标题划线+变淡
  const doneRow = page.locator("[data-testid=dv-plan-row][data-state=completed]", { hasText: "未计时完成验收项" });
  const deco = await doneRow.locator(".dv-plan-title").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { line: cs.textDecorationLine, faint: cs.color };
  });
  ok("完成态标题划线", deco.line.includes("line-through"), `deco=${deco.line}`);

  // ④ ↩ 放回稿库：completed → pool
  await doneRow.hover();
  await doneRow.locator("[data-testid=dv-plan-reopen]").click();
  await sleep(400);
  const backToPool = (await page.locator("[data-testid=dv-plan-row][data-state=pool]", { hasText: "未计时完成验收项" }).count()) === 1;
  ok("↩ 放回稿库（回 pool）", backToPool, "");

  // ⑤ 删除即消失
  await page.fill("[data-testid=dv-plan-input]", "要消失的计划");
  await page.press("[data-testid=dv-plan-input]", "Enter");
  await sleep(400);
  const delRow = page.locator("[data-testid=dv-plan-row]", { hasText: "要消失的计划" });
  await delRow.locator("[data-testid=dv-plan-del]").click();
  await sleep(400);
  const gone = (await page.locator("[data-testid=dv-plan-row]", { hasText: "要消失的计划" }).count()) === 0;
  ok("删除即消失", gone, "");
}

// 9. 日视角锚点=月历选中日（非强制今天）
await page.click(`.day-unit[data-day="${todayStr()}"] .day-big-label`).catch(async () => {
  await page.click("[data-testid=daygrid-date]").catch(() => {});
});
await page.waitForSelector("[data-testid=month-cal]");
await page.click(`[data-testid=cal-cell][data-day="${targetDay}"]`);
await sleep(200);
await page.dblclick(`[data-testid=cal-cell][data-day="${targetDay}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(700);
const anchorDay = await page.evaluate((d) => {
  const sc = document.querySelector("[data-testid=daygrid-scroll]");
  const el = sc.querySelector(`.day-unit[data-day="${d}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const sr = sc.getBoundingClientRect();
  return { off: Math.round(r.top - sr.top), inView: r.top >= sr.top - 40 && r.top < sr.top + sr.height };
}, targetDay);
ok("日视角锚点=选中日", !!anchorDay && anchorDay.inView, JSON.stringify(anchorDay));

// 10. 增量生长 prepend 不跳：滚到顶附近 → 内容增多而视口不动
const before = await page.evaluate(() => {
  const sc = document.querySelector("[data-testid=daygrid-scroll]");
  return { top: sc.scrollTop, h: sc.scrollHeight };
});
await page.evaluate(() => {
  const sc = document.querySelector("[data-testid=daygrid-scroll]");
  sc.scrollTop = 100;
});
await sleep(700);
const after = await page.evaluate(() => {
  const sc = document.querySelector("[data-testid=daygrid-scroll]");
  return { top: sc.scrollTop, h: sc.scrollHeight };
});
ok(
  "prepend 增量生长不跳（scrollTop 补偿）",
  after.h > before.h && after.top > before.top,
  `h ${before.h}→${after.h}, top ${before.top}→${after.top}`,
);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n== M3 v1.1 ${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
