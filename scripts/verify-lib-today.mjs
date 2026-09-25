// 稿库分组验收：今日剩余只收 无预定日+恰为今天；过去的计划不进稿库
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=board-page]");
await sleep(600);

// 注入：一条前天到期的计划（pool）
await page.evaluate(() => {
  const m = window.__mock;
  const d = new Date(Date.now() - 2 * 86400000);
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  m.plans.push({
    id: 9001, title: "前天遗留的计划", est_minutes: null, scheduled_date: ds,
    state: "pool", created_at: Date.now() - 2 * 86400000, completed_at: null, position: 9001,
  });
});
await sleep(10500); // 等 10s 重同步把 plans 吸进来

await page.click("[data-testid=lib-rail]");
await page.waitForSelector("[data-testid=lib-panel].open");
await sleep(400);

const groups = await page.evaluate(() => {
  const out = {};
  for (const g of document.querySelectorAll(".lib-group")) {
    const title = g.querySelector(".lib-group-title").textContent;
    out[title] = [...g.querySelectorAll("[data-testid=plan-row]")].map((r) => r.textContent.trim());
  }
  return out;
});
console.log(JSON.stringify(groups, null, 1));
const todayRows = groups["今日剩余"] ?? [];
const futureRows = groups["明日草稿"] ?? [];
ok("今日剩余含今天的计划（订下周差旅）", todayRows.some((t) => t.includes("订下周差旅")));
ok("今日剩余不含前天遗留", !todayRows.some((t) => t.includes("前天遗留")));
ok("明日草稿不含前天遗留", !futureRows.some((t) => t.includes("前天遗留")));
ok("前天遗留不进稿库任何组", !todayRows.concat(futureRows).some((t) => t.includes("前天遗留")));

console.log(`\n${results.filter(Boolean).length}/${results.length} 通过`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
