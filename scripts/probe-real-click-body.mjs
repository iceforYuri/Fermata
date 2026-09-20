// 真实输入对照：版面主体（挂起行）可点 vs 导航条不可点
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const PROBE = "scripts/input-probe/target/release/input-probe.exe";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=board-page]", { timeout: 15000 });
await page.waitForTimeout(800);

const where = execFileSync(PROBE, ["where"], { encoding: "utf8" });
const [ox, oy] = where.match(/clientOrigin=(\d+),(\d+)/).slice(1).map(Number);
const dpr = await page.evaluate(() => devicePixelRatio);
const toPhys = (cx, cy) => [Math.round(ox + cx * dpr), Math.round(oy + cy * dpr)];

// A. 真实点击挂起队列第一行主体（应弹出断点卡）
const rowRect = await page.evaluate(() => {
  const el = document.querySelector("[data-pid-main]");
  const r = el.getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
});
let [px, py] = toPhys(rowRect.cx, rowRect.cy);
execFileSync(PROBE, [String(px), String(py), "click"], { encoding: "utf8" });
await page.waitForTimeout(600);
const cardShown = await page.evaluate(() => !!document.querySelector(".micro-card, [data-testid=bp-card]"));
console.log(`A 版面主体真实点击 @(${px},${py}) → 断点卡出现=${cardShown} ${cardShown ? "PASS(主体可点)" : "FAIL"}`);
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(400);

// B. 对照：真实点击导航 stats tab
const tabRect = await page.evaluate(() => {
  const r = document.querySelector("[data-testid=tab-stats]").getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
});
[px, py] = toPhys(tabRect.cx, tabRect.cy);
execFileSync(PROBE, [String(px), String(py), "click"], { encoding: "utf8" });
await page.waitForTimeout(700);
const cur = await page.evaluate(() => document.querySelector(".morph-tab.active")?.dataset.testid);
console.log(`B 导航条真实点击 @(${px},${py}) → active=${cur} ${cur === "tab-stats" ? "PASS" : "FAIL(导航不吃真实点击)"}`);
await browser.close();
