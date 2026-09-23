// v1.3.0 release 截图刷新（mock 种子）：版面(双轴老化) / 月视角(920宽+记录入口) / README 头图
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const REL = "docs/screenshots/release";

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=board-page]");
await sleep(1200);
// 等老化渐变稳定（行褪 + 标签沉都是 CSS 变量即时生效，无需等动画）
await page.screenshot({ path: `${REL}/readme-board.png` });
await page.screenshot({ path: `${REL}/board-rich.png` });

// 月视角：920 宽 + 未做完区 + 个人记录入口
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await sleep(900);
// 锚到昨天（未做完区有内容：种子把写周报挪昨天？不——种子今天的进行中足够；记录入口在本月）
await page.screenshot({ path: `${REL}/stats-month.png` });

console.log("release 截图 3 张完成");
await browser.close();
