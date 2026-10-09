// 统计页"进 tab 即刷新"复验（浏览器 mock 空库）：
// 统计页先挂载取数（空）→ 回进程页开工 → 再进统计页，大环图例与月历今格应出现新进程。
// 修复前：组件只在挂载/切视角时取数，第二次进 tab 仍是空。
import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
await page.goto("http://localhost:14200/?fixture=empty#/", { waitUntil: "networkidle" });

// 1. 先进统计页（月视角）：空库 → 大环"没有计时记录"、今格无迷你环
await page.click("[data-testid=tab-stats]");
await sleep(700);
ok(
  "首访统计页：大环空态",
  (await page.locator("[data-testid=big-ring-legend] .legend-row").count()) === 0,
);
const miniBefore = await page.locator("[data-testid=month-cal] .cal-cell.today svg circle[stroke-dasharray]").count();

// 2. 回进程页：新建一件并切入运行（产生开口段）
await page.click("[data-testid=tab-board]");
await sleep(700);
await page.click("[data-testid=new-row-input]");
await page.keyboard.type("刷新探针进程");
await page.keyboard.press("Enter");
await sleep(500);
await page.locator("[data-testid=suspended-row] .row-main").first().click();
await sleep(600);
if ((await page.locator("[data-testid=bp-card]").count()) > 0) {
  await page.keyboard.press("Enter"); // 断点卡：采纳默认
  await sleep(400);
}
ok("进程已运行", (await page.locator("[data-testid=active-row]").count()) === 1);
await sleep(1500); // 让开口段攒出真实 ms

// 3. 再进统计页：应已重取数——大环图例出现该进程，月历今格出环
await page.click("[data-testid=tab-stats]");
await sleep(900);
const legendRows = await page.locator("[data-testid=big-ring-legend] .legend-row").count();
ok("再进统计页：大环图例出现新进程", legendRows === 1, `rows=${legendRows}`);
const legendText = (await page.locator("[data-testid=big-ring-legend]").innerText()) ?? "";
ok("图例标题正确", legendText.includes("刷新探针进程"));
const miniAfter = await page.locator("[data-testid=month-cal] .cal-cell.today svg circle[stroke-dasharray]").count();
ok("月历今格出现迷你环", miniAfter > miniBefore, `before=${miniBefore} after=${miniAfter}`);

await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length} 通过`);
process.exit(pass === results.length ? 0 : 1);
