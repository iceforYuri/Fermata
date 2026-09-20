// 真实 exe：锚点实测 + 快速滚轮不跳底 + 悬停浮窗
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=tab-stats]", { timeout: 15000 });
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await page.waitForTimeout(1600);

// 1. 锚点拆解
const a = await page.evaluate(() => {
  const sc = document.querySelector(".daygrid-scroll");
  const label = document.querySelector(`[data-day] [data-testid=day-big-label]`);
  // 找今天单元的大标
  const units = [...document.querySelectorAll("[data-testid=day-unit]")];
  const today = units[units.length - 1];
  const lbl = today.querySelector("[data-testid=day-big-label]");
  const cs = getComputedStyle(sc);
  return {
    labelBottom: Math.round(lbl.getBoundingClientRect().bottom * 100) / 100,
    scrollBottom: Math.round(sc.getBoundingClientRect().bottom * 100) / 100,
    innerH: innerHeight,
    padBottom: cs.paddingBottom,
    dpr: devicePixelRatio,
    gapToWindow: Math.round((innerHeight - lbl.getBoundingClientRect().bottom) * 100) / 100,
    gapToScroll: Math.round((sc.getBoundingClientRect().bottom - lbl.getBoundingClientRect().bottom) * 100) / 100,
  };
});
console.log("锚点拆解:", JSON.stringify(a));

// 2. 快速滚轮上滚 40 次，观察 scrollTop 是否跳底
const before = await page.evaluate(() => document.querySelector(".daygrid-scroll").scrollTop);
await page.mouse.move(640, 500);
for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -300);
await page.waitForTimeout(1200);
const after = await page.evaluate(() => {
  const sc = document.querySelector(".daygrid-scroll");
  return { top: sc.scrollTop, max: sc.scrollHeight - sc.clientHeight };
});
console.log(`滚轮测试: 前=${before} 后 top=${Math.round(after.top)} max=${after.max} ${after.top < after.max - 50 ? "未跳底 PASS" : "跳底 FAIL"}`);

// 3. 悬停浮窗（真实数据，视口内找圆）
const box = await page.evaluate(() => {
  const el = [...document.querySelectorAll(".dg-dot")].find((e) => {
    const r = e.getBoundingClientRect();
    return r.top > 140 && r.bottom < innerHeight - 140 && r.left > 40 && r.right < innerWidth - 40;
  });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (box) {
  await page.mouse.move(box.x, box.y, { steps: 3 });
  await page.waitForTimeout(350);
  const tip = await page.$("[data-testid=dg-tip]");
  const txt = tip ? await tip.textContent() : null;
  console.log("浮窗:", tip ? `出现 ✓ "${txt}"` : "未出现 FAIL");
} else {
  console.log("视口内无圆可悬停");
}
await page.screenshot({ path: "docs/screenshots/v12/real-v124-day-wheel.png" });
process.exit(0);
