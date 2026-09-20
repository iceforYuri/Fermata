// 顶栏弹簧竞态回归：快速连点后形态必须收敛到正确 tab；点击延迟实测
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:14200";
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.waitForTimeout(600);

// 快速连点：stats→settings→board→stats→settings（间隔 60ms，远小于弹簧 0.42s）
for (const t of ["stats", "settings", "board", "stats", "settings"]) {
  await page.click(`[data-testid=tab-${t}]`);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(900); // 弹簧收敛

const m = await page.evaluate(() => {
  const cur = document.querySelector(".track-page.current");
  const tabs = [...document.querySelectorAll(".morph-tab")].map((el) => ({
    key: el.dataset.testid,
    active: el.classList.contains("active"),
    w: Math.round(el.getBoundingClientRect().width),
    labelOpacity: parseFloat(getComputedStyle(el.querySelector(".nav-label")).opacity),
  }));
  return { tabs, currentPage: !!cur };
});
console.log(JSON.stringify(m.tabs, null, 1));
const settings = m.tabs.find((t) => t.key === "tab-settings");
const others = m.tabs.filter((t) => t.key !== "tab-settings");
const converged =
  settings.active && settings.w > 80 && settings.labelOpacity > 0.95 &&
  others.every((t) => !t.active && t.w <= 38 && t.labelOpacity < 0.05);
console.log(converged ? "弹簧收敛正确 PASS" : "弹簧卡死 FAIL");

// 点击延迟：面板全关时点击→轨道开始动
const lat = await page.evaluate(async () => {
  const track = document.querySelector(".track");
  const t0 = performance.now();
  return await new Promise((resolve) => {
    const obs = new MutationObserver(() => resolve(performance.now() - t0));
    obs.observe(track, { attributes: true, attributeFilter: ["style", "class"] });
    document.querySelector("[data-testid=tab-board]").click();
    setTimeout(() => resolve(-1), 2000);
  });
});
console.log(`点击→轨道响应: ${Math.round(lat)}ms ${lat >= 0 && lat < 60 ? "PASS" : "FAIL"}`);
await browser.close();
process.exit(converged && lat >= 0 && lat < 60 ? 0 : 1);
