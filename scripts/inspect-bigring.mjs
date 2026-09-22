// 真实数据大环体检：回月视角，截大环，dump 份额数据
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 回月视角（视角胶囊）
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("[data-testid^=view-], .view-cap, [data-view]")];
  return btns.map((b) => b.dataset.testid || b.className);
});
const caps = await page.evaluate(() =>
  [...document.querySelectorAll("button")].map((b) => ({ t: b.textContent.trim(), id: b.dataset.testid })).filter((b) => /^(年|月|日)$/.test(b.t)),
);
console.log("视角按钮:", JSON.stringify(caps));
const monthBtn = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "月");
  return b?.dataset.testid ?? null;
});
if (monthBtn) await page.click(`[data-testid=${monthBtn}]`);
await sleep(800);
await page.waitForSelector("[data-testid=big-ring]", { timeout: 8000 });
const box = await page.locator("[data-testid=bigring]").boundingBox();
await page.screenshot({
  path: "docs/screenshots/v12/real-bigring.png",
  clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 },
});
console.log("已截 real-bigring.png", JSON.stringify(box));

// 环数据：份额 + 角度端点
const info = await page.evaluate(() => {
  const svg = document.querySelector("[data-testid=big-ring]");
  const segs = [...svg.querySelectorAll("circle[stroke-dasharray]")].map((c) => ({
    stroke: c.getAttribute("stroke"),
    dash: c.getAttribute("stroke-dasharray"),
    offset: c.getAttribute("stroke-dashoffset"),
  }));
  return { size: svg.getAttribute("width"), segs };
});
console.log(JSON.stringify(info, null, 1));
process.exit(0);
