// 真实 exe：构建戳可见 + 顶栏弹簧连点收敛（与浏览器同口径）
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));

// 快速连点 5 次（60ms 间隔）
await page.waitForSelector("[data-testid=tab-board]", { timeout: 15000 });
for (const t of ["stats", "settings", "board", "stats", "settings"]) {
  await page.click(`[data-testid=tab-${t}]`);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(900);
const m = await page.evaluate(() =>
  [...document.querySelectorAll(".morph-tab")].map((el) => ({
    key: el.dataset.testid, active: el.classList.contains("active"),
    w: Math.round(el.getBoundingClientRect().width),
    labelOpacity: parseFloat(getComputedStyle(el.querySelector(".nav-label")).opacity),
  })),
);
console.log(JSON.stringify(m));
const settings = m.find((t) => t.key === "tab-settings");
const others = m.filter((t) => t.key !== "tab-settings");
const converged = settings.active && settings.w > 80 && settings.labelOpacity > 0.95 &&
  others.every((t) => !t.active && t.w <= 38 && t.labelOpacity < 0.05);
console.log(converged ? "真实exe 弹簧收敛 PASS" : "真实exe 弹簧卡死 FAIL");

// 构建戳（当前已在设置页）
await page.evaluate(() => { document.querySelector(".tab-page.current .stats-scroll, .tab-page.current [class*=scroll]")?.scrollTo?.(0, 99999); });
const stamp = await page.evaluate(() => {
  const el = document.querySelector("[data-testid=build-stamp]");
  if (!el) return null;
  el.scrollIntoView();
  return el.textContent;
});
console.log("构建戳:", stamp ?? "未找到 FAIL");
await page.screenshot({ path: "docs/screenshots/v12/real-build-stamp.png" });
process.exit(converged && stamp ? 0 : 1);
