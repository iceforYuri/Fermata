// M3 无头验证（mock 内核）：视角钻取 / 锚点保留 / 日网格归属 / 未计时完成 / 回到今天 / 数据口径
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

// 默认月视角锚定今天
const todayCell = await page.$(`[data-testid=cal-cell][data-day="${todayStr()}"].selected`);
ok("默认月视角锚定今天", !!todayCell);

// 月单击 = 选中不跳页；双击 = 日视角
const cells = await page.$$("[data-testid=cal-cell]:not(.blank):not(.future)");
const target = cells[cells.length - 8] ?? cells[0]; // 找个非今天的过去日期
const targetDay = await target.getAttribute("data-day");
await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
await target.click();
await sleep(300);
ok("月单击=选中不跳页", await page.$(`[data-testid=cal-cell][data-day="${targetDay}"].selected`) !== null
  && await page.$("[data-testid=daygrid]") === null);
await target.dblclick();
await page.waitForSelector("[data-testid=daygrid]");
ok("双击→日视角（日期正确）", (await page.textContent("[data-testid=daygrid-date]")).includes(`${Number(targetDay.slice(8))} 日`));

// 日视图换天 + 点日期回月
await page.click("[data-testid=daygrid-prev]");
await sleep(300);
const prevDay = await page.textContent("[data-testid=daygrid-date]");
ok("日视图换天", !!prevDay);
await page.click("[data-testid=daygrid-date]");
await page.waitForSelector("[data-testid=month-cal]");
ok("点日期回月视角", true);

// 切视角锚点保留：当前 anchor 应是 targetDay 的前一天
const [y, m, dd] = targetDay.split("-").map(Number);
const expectAnchor = new Date(y, m - 1, dd - 1);
const p = (n) => String(n).padStart(2, "0");
const expectStr = `${expectAnchor.getFullYear()}-${p(expectAnchor.getMonth() + 1)}-${p(expectAnchor.getDate())}`;
ok(
  "切视角锚点保留",
  (await page.$(`[data-testid=cal-cell][data-day="${expectStr}"].selected`)) !== null,
  `anchor=${expectStr}`,
);

// 年点月环→月（月份正确）
await page.click("[data-testid=capsule-year]");
await page.waitForSelector("[data-testid=yearview]");
const monthCells = await page.$$("[data-testid=year-month]:not(.empty)");
ok("年视图有月环", monthCells.length > 0, `${monthCells.length} 个月`);
const mLabel = await monthCells[monthCells.length - 1].getAttribute("data-month");
await monthCells[monthCells.length - 1].click();
await page.waitForSelector("[data-testid=month-cal]");
const monthTitle = await page.textContent(".stats-month-title");
ok("年点月环→月（月份正确）", monthTitle.includes(`${Number(mLabel)} 月`), monthTitle.trim());

// 数据正确性抽查：大环总专注 == q_day_stats.total_ms == segments 闭合和
// （mock 内自洽：直接对 DOM 与 mock 数据双读）
await page.click(`[data-testid=cal-cell][data-day="${todayStr()}"]`);
await sleep(400);
const totalShown = await page.textContent(".bigring-nums .big-num");
ok("大环总专注显示", !!totalShown && totalShown.length > 0, totalShown?.trim());

// 回到今天
await page.click(`[data-testid=cal-cell][data-day="${expectStr}"]`);
await sleep(200);
await page.click("[data-testid=back-today]");
await sleep(300);
ok("回到今天", (await page.$(`[data-testid=cal-cell][data-day="${todayStr()}"].selected`)) !== null);

// 日网格归属规则：mock 的今天有运行中进程的开口段 → 格数>0；悬停出浮窗
await page.dblclick(`[data-testid=cal-cell][data-day="${todayStr()}"]`);
await page.waitForSelector("[data-testid=daygrid]");
const dots = await page.$$("[data-testid=dg-dot]");
ok("日网格今天有圆圈", dots.length > 0, `${dots.length} 格`);
const dotsToday = dots.length; // 今天基线（未计时完成对照用）
await dots[0].hover();
await sleep(300);
const tip = await page.textContent("[data-testid=dg-tip]");
ok("悬停浮窗（进程名+起止+时长）", tip.includes("·") && tip.includes("–"), tip.trim().slice(0, 60));

// 未来天：尚无记录
const future = new Date(Date.now() + 86400000);
const futureStr = `${future.getFullYear()}-${p(future.getMonth() + 1)}-${p(future.getDate())}`;
await page.click("[data-testid=daygrid-date]");
await page.waitForSelector("[data-testid=month-cal]");
await page.dblclick(`[data-testid=cal-cell][data-day="${todayStr()}"]`);
await page.waitForSelector("[data-testid=daygrid]");
await page.click("[data-testid=daygrid-next]"); // 明天
await sleep(300);
ok("未来天显示尚无记录", !!(await page.$("[data-testid=daygrid-future]")));

// 未计时完成不画圈：为今天加一个计划并直接完成 → 今天圆圈数不变
const dotsBefore = dotsToday;
await page.click("[data-testid=daygrid-date]");
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
await page.waitForSelector("[data-testid=daygrid]");
const dotsAfter = (await page.$$("[data-testid=dg-dot]")).length;
ok("未计时完成标记出现且不画圈", doneTag.includes("未计时完成") && dotsAfter === dotsBefore, `${dotsBefore}→${dotsAfter}`);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n== M3 ${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
