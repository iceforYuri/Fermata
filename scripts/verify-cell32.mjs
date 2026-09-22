// 真实数据终验：格32（11:20-11:30）朝向应为右下（中段），浮窗时长=实际占用
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.waitForSelector("[data-testid=tab-stats]", { timeout: 15000 });
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await sleep(500);
await page.dblclick('[data-testid=cal-cell][data-day="2026-09-22"]');
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(900);

// 格 32 的标记：clip 路径 + is_end 方向（DOM 层判定）
const cell32 = await page.evaluate(() => {
  const unit = document.querySelector('[data-day="2026-09-22"]');
  const cell = unit.querySelector('[data-cell="32"]');
  const circles = [...cell.querySelectorAll("svg circle[clip-path]")];
  const paths = [...cell.querySelectorAll("svg clipPath path")].map((p) => p.getAttribute("d"));
  return { circleCount: circles.length, paths };
});
console.log("格32 clip:", JSON.stringify(cell32));
// 右下半 = "M 0 26 L26 0 L26 26 Z"；左上 = "M 0 26 L26 0 L0 0 Z"
const rightBottom = cell32.paths[0]?.includes("L28 28");
console.log(rightBottom ? "✓ 格32 朝向右下（中段，不翻边）" : "✗ 格32 仍翻左上");

// 悬停出浮窗：时长应为实际占用（≈5-6m），不是跨度 10m
const box = await page.locator('[data-day="2026-09-22"] [data-cell="32"]').boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await sleep(400);
await page.waitForSelector("[data-testid=dg-tip]");
const tip = await page.locator("[data-testid=dg-tip]").innerText();
console.log("浮窗内容:", JSON.stringify(tip));
const m = tip.match(/·\s*([\d.]+m)/g);
console.log(m && !m.some((x) => x.includes("10m")) ? "✓ 浮窗时长=实际占用（无 10m 虚报）" : "✗ 浮窗仍报 10m");
await page.screenshot({ path: "docs/screenshots/v12/cell32-tooltip.png" });
process.exit(0);
