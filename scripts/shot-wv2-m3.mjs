// M3 真实 WebView2 截图（CDP :9222，seed:deep 库）：月视角 / 日网格 / 年视图
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "docs/screenshots/m3";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://localhost:9222");
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("14200") && !p.url().includes("window="));
if (!page) process.exit(1);
await page.waitForSelector("[data-testid=board-page]", { timeout: 30000 });
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/wv2-stats-month.png` });

// 日网格：双击今天
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid]");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/wv2-stats-daygrid.png` });

// 年视图
await page.click("[data-testid=daygrid-date]");
await page.waitForSelector("[data-testid=month-cal]");
await page.click("[data-testid=capsule-year]");
await page.waitForSelector("[data-testid=yearview]");
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/wv2-stats-year.png` });

// 数据口径抽查：大环总专注 == q_day_stats.total_ms == segments 闭合和（真实库直查）
const inv = (cmd, args = {}) => page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);
const stats = await inv("q_day_stats", { day: ds });
const sum = stats.slices.reduce((a, s) => a + s.ms, 0);
console.log(`[口径] total_ms=${stats.total_ms} slices和=${sum} 一致=${stats.total_ms === sum}`);
console.log("[wv2] 3 张已存");
await browser.close();
process.exit(stats.total_ms === sum ? 0 : 1);
