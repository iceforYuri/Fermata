// 终验：置顶 + 精确坐标 + 真实输入。导航三 tab + 版面主体对照
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const PROBE = "scripts/input-probe/target/release/input-probe.exe";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=board-page]", { timeout: 15000 });
await page.waitForTimeout(800);

execFileSync(PROBE, ["topmost"]);
const where = execFileSync(PROBE, ["where"], { encoding: "utf8" });
const mOrigin = where.match(/clientOrigin=(\d+),(\d+)/);
if (!mOrigin) {
  console.log("where 输出异常:", where);
  process.exit(1);
}
const [ox, oy] = mOrigin.slice(1).map(Number);
const dpr = await page.evaluate(() => devicePixelRatio);
console.log(`clientOrigin=(${ox},${oy}) dpr=${dpr}`);

const rectOf = (sel) => page.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}, sel);
const toPhys = (p) => [Math.round(ox + p.cx * dpr), Math.round(oy + p.cy * dpr)];
const active = () => page.evaluate(() => document.querySelector(".morph-tab.active")?.dataset.testid);

let pass = 0, total = 0;
// 导航真实点击
for (const target of ["stats", "board", "settings", "board"]) {
  const [px, py] = toPhys(await rectOf(`[data-testid=tab-${target}]`));
  execFileSync(PROBE, [String(px), String(py), "click"]);
  await page.waitForTimeout(650);
  const cur = await active();
  total++; if (cur === `tab-${target}`) pass++;
  console.log(`导航 ${target} @(${px},${py}) → ${cur} ${cur === `tab-${target}` ? "✓" : "✗"}`);
}
// 版面主体真实点击（对照组：挂起行 → 断点卡）
{
  const [px, py] = toPhys(await rectOf("[data-pid-main]"));
  execFileSync(PROBE, [String(px), String(py), "click"]);
  await page.waitForTimeout(600);
  const card = await page.evaluate(() => !!document.querySelector(".micro-card, [data-testid=bp-card]"));
  total++; if (card) pass++;
  console.log(`主体 挂起行 @(${px},${py}) → 断点卡=${card} ${card ? "✓" : "✗"}`);
}
console.log(`总计: ${pass}/${total}`);
await browser.close();
process.exit(pass === total ? 0 : 1);
