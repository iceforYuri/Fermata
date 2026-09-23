// 个人记录子页验收：入口计数 / 分组归月 / 时间戳（戳 vs 存量回退）/ 点行开详情卡
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };
const SHOT = "docs/screenshots/v13";

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=board-page]");
await sleep(600);
await page.click("[data-testid=tab-stats]");
await sleep(900);

// --- 入口：本月 2 条（种子：回三封邮件今天、写周报昨天，均本月） ---
const entry = page.locator("[data-testid=notes-entry]");
ok("入口行出现（本月 2 条）", (await entry.count()) === 1 && /本月 2 条/.test(await entry.textContent()),
  `文案=${await entry.textContent().catch(() => "无")}`);
await page.screenshot({ path: `${SHOT}/notes-entry.png` });

// --- 子页：共 3 条、两组（本月 + 存量历史月）、汇总占位 ---
await entry.click();
await page.waitForSelector("[data-testid=notes-overlay]");
await sleep(400);
const head = await page.locator(".notes-head").textContent();
ok("头部共 3 条", /共 3 条/.test(head), head);
ok("月度汇总占位在", (await page.locator(".notes-summary-slot").count()) === 1);
const groupLabels = await page.locator(".notes-panel .detail-label").allTextContents();
ok("按月两组", groupLabels.length === 2 && /2 条/.test(groupLabels[0]) && /1 条/.test(groupLabels[1]),
  JSON.stringify(groupLabels));
const rows = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid=note-row]")].map((r) => ({
    pid: r.getAttribute("data-pid"),
    meta: r.querySelector(".note-meta").textContent,
    legacy: !!r.querySelector(".note-time.legacy"),
    dot: r.querySelector(".note-dot").style.background,
  })),
);
ok("带戳两条显示「记于」", rows.filter((r) => !r.legacy).length === 2 && rows.filter((r) => !r.legacy).every((r) => r.meta.includes("记于")));
ok("存量一条显示「排入」（回退）", rows.filter((r) => r.legacy).length === 1 && rows.find((r) => r.legacy).meta.includes("排入"),
  JSON.stringify(rows.find((r) => r.legacy)));
ok("色标点：两条带色（黛/朱）一条灰", rows.filter((r) => r.dot && !r.dot.includes("var")).length === 2,
  JSON.stringify(rows.map((r) => r.dot)));
await page.screenshot({ path: `${SHOT}/notes-overlay.png` });

// --- 点行 → 子页收 + 该进程详情卡开 ---
const firstTitle = rows[0].meta;
await page.locator("[data-testid=note-row]").first().click();
await page.waitForSelector("[data-testid=stats-detail]");
await sleep(300);
ok("点行开详情卡、记录子页已收", (await page.locator("[data-testid=notes-overlay]").count()) === 0);
const sdTitle = await page.locator("[data-testid=sd-title]").textContent();
ok("详情卡属被点进程", firstTitle.includes(sdTitle), `卡=${sdTitle} 行=${firstTitle}`);

// --- 反场后卸载 ---
await page.click("[data-testid=sd-close]");
await sleep(400);

console.log(`\n${results.filter(Boolean).length}/${results.length} 通过`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
