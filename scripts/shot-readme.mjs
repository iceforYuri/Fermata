// README 主打截图：种子库 + 真实 exe，三张（版面 / 日网格 / 设置暗色）
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=board-page]", { timeout: 15000 });
await page.waitForTimeout(1500);

// 1. 版面（亮色）
await page.screenshot({ path: "docs/screenshots/release/readme-board.png" });

// 2. 统计页日网格（双击今天）
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await page.waitForTimeout(700);
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await page.waitForTimeout(1500);
await page.screenshot({ path: "docs/screenshots/release/readme-daygrid.png" });

// 3. 设置页（双态控件：点主题行 → 展开选项 → 选"暗 · 工作台"）
await page.click("[data-testid=tab-settings]");
await page.waitForTimeout(900);
await page.click("[data-testid=set-theme]");
await page.waitForTimeout(400);
await page.click("[data-testid=set-theme-opt-dark]");
await page.waitForTimeout(900);
await page.screenshot({ path: "docs/screenshots/release/readme-settings-dark.png" });

// 4. 暗色版面
await page.click("[data-testid=tab-board]");
await page.waitForTimeout(1200);
await page.screenshot({ path: "docs/screenshots/release/readme-board-dark.png" });
console.log("readme 截图 4 张完成");
process.exit(0);
