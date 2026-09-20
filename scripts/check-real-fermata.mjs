// Fermata 真实 exe 验收：初始紧凑导航 + 构建戳 + 数据迁移在位
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=board-page]", { timeout: 15000 });
await page.waitForTimeout(400);

// 1. 初始紧凑（无任何点击）
const m = await page.evaluate(() =>
  [...document.querySelectorAll(".morph-tab")].map((el) => ({
    key: el.dataset.testid,
    active: el.classList.contains("active"),
    w: Math.round(el.getBoundingClientRect().width),
    labelOpacity: parseFloat(getComputedStyle(el.querySelector(".nav-label")).opacity),
  })),
);
const board = m.find((t) => t.key === "tab-board");
const others = m.filter((t) => t.key !== "tab-board");
const compact = board.active && board.w > 80 && others.every((t) => t.w <= 38 && t.labelOpacity < 0.05);
console.log("初始紧凑:", JSON.stringify(m), compact ? "PASS" : "FAIL");

// 2. 数据迁移：版面有真实进程
const rows = await page.evaluate(() => ({
  suspended: document.querySelectorAll("[data-testid=suspended-queue] > *").length,
  hasContent: document.body.textContent.length > 100,
}));
console.log("版面内容:", JSON.stringify(rows));

// 3. 构建戳（设置页）
await page.click("[data-testid=tab-settings]");
await page.waitForTimeout(800);
const stamp = await page.evaluate(() => document.querySelector("[data-testid=build-stamp]")?.textContent ?? null);
console.log("构建戳:", stamp ?? "未找到 FAIL");
await page.screenshot({ path: "docs/screenshots/v12/fermata-final.png" });
process.exit(compact && stamp ? 0 : 1);
