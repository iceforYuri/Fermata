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
await page.click(`.day-unit[data-day="${todayStr()}"] .day-unit-head`);
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
ok("日网格今天有圆圈", dots.length > 0, `${dots.length} 格`);
const dotsToday = dots.length;
await dots[dots.length - 1].hover();
await sleep(300);
const tip = await page.textContent("[data-testid=dg-tip]");
ok("悬停浮窗（进程名+起止+时长）", tip.includes("·") && tip.includes("–"), tip.trim().slice(0, 60));
await page.mouse.move(24, 100);

// 8. 未计时完成不画圈：今天加计划并直接完成 → 圆圈数不变
await page.click(`.day-unit[data-day="${todayStr()}"] .day-unit-head`);
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

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n== M3 v1.1 ${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
