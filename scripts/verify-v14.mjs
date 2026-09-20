// v1.4 日视角五项验收：跳底修复 / 进场锚点40 / 底部40 / 浮窗口径 / 半圆分布
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:14200";
const OUT = "docs/screenshots/v12";
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };

await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await sleep(500);
const d = new Date();
const p = (n) => String(n).padStart(2, "0");
const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${today}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(900);

const state = () =>
  page.evaluate(() => {
    const r = document.querySelector("[data-testid=daygrid-scroll]");
    const mid = r.scrollTop + r.clientHeight / 2;
    let cur = null;
    r.querySelectorAll(".day-unit").forEach((el) => {
      const top = el.offsetTop;
      if (top <= mid && top + el.offsetHeight > mid) cur = el.dataset.day;
    });
    return { day: cur, scrollTop: Math.round(r.scrollTop), scrollHeight: r.scrollHeight, units: r.querySelectorAll(".day-unit").length };
  });

// ── 1. 进场锚点：锚日(今天)大日期标底缘距窗口底 ≈40px ──
const enter = await page.evaluate(() => {
  const r = document.querySelector("[data-testid=daygrid-scroll]");
  const unit = r.querySelector(`.day-unit[data-day="${r.querySelector(".day-unit:last-child").dataset.day}"]`);
  const big = unit.querySelector("[data-testid=day-big-label]");
  return { gap: Math.round(window.innerHeight - big.getBoundingClientRect().bottom), day: unit.dataset.day };
});
ok("进场锚点=大日期标距窗口底40px", Math.abs(enter.gap - 40) <= 4, `gap=${enter.gap}px（锚日=${enter.day}）`);
await page.screenshot({ path: `${OUT}/v14-enter-anchor.png` });

// ── 2. 快速滚轮 40 连发：视口不跳底 ──
for (let i = 0; i < 40; i++) {
  await page.mouse.wheel(0, -53);
  await sleep(30);
}
await sleep(1000);
const after = await state();
ok("快速滚轮无跳底", after.day !== today && after.scrollTop < after.scrollHeight - 900,
  `视口=${after.day} scrollTop=${after.scrollTop}/${after.scrollHeight}`);
await page.screenshot({ path: `${OUT}/v14-wheel-nojump.png` });

// ── 3. 滚到最底：今天大日期标距窗口底 ≈40px（垫高统一）──
await page.evaluate(() => {
  const r = document.querySelector("[data-testid=daygrid-scroll]");
  r.scrollTop = r.scrollHeight;
});
await sleep(600);
const bottom = await page.evaluate(() => {
  const r = document.querySelector("[data-testid=daygrid-scroll]");
  const big = r.querySelector(".day-unit:last-child").querySelector("[data-testid=day-big-label]");
  return {
    gap: Math.round(window.innerHeight - big.getBoundingClientRect().bottom),
    atMax: r.scrollTop >= r.scrollHeight - r.clientHeight - 1,
    day: r.querySelector(".day-unit:last-child").dataset.day,
  };
});
ok("滚到底=今天大日期标距窗口底40px", Math.abs(bottom.gap - 40) <= 4 && bottom.atMax && bottom.day === today,
  `gap=${bottom.gap}px atMax=${bottom.atMax} 末日=${bottom.day}`);

// ── 4. 滚动条隐藏（布局占位 0）──
const sb = await page.evaluate(() => {
  const r = document.querySelector("[data-testid=daygrid-scroll]");
  return r.offsetWidth - r.clientWidth;
});
ok("滚动条无布局占位", sb === 0, `diff=${sb}px`);

// ── 5. 浮窗口径：悬停某点 → 时间区间在所悬格的 10 分钟窗内 ──
// 滚回今天，找一枚圆点（优先半圆：验证部分格）
await page.evaluate(() => {
  const r = document.querySelector("[data-testid=daygrid-scroll]");
  r.scrollTop = r.scrollHeight;
});
await sleep(600);
const hoverTest = await page.evaluate(() => {
  const r = document.querySelector("[data-testid=daygrid-scroll]");
  const unit = r.querySelector(".day-unit:last-child");
  const marks = [...unit.querySelectorAll("[data-testid=dg-dot]")];
  const half = marks.find((m) => m.classList.contains("dg-half")) ?? marks[0];
  const rect = marks.length ? half.getBoundingClientRect() : null;
  return { count: marks.length, hasHalf: marks.some((m) => m.classList.contains("dg-half")), x: rect?.x, y: rect?.y, day: unit.dataset.day };
});
let tipOk = false, tipInfo = "";
if (hoverTest.count > 0) {
  // 半圆命中区只占半边：右下/左上/中心多试几个落点
  const pts = [[8, 18], [18, 8], [13, 13]];
  let tip = null, cellIdx = null;
  for (const [dx, dy] of pts) {
    const x = hoverTest.x + dx, y = hoverTest.y + dy;
    await page.mouse.move(x, y, { steps: 3 });
    await sleep(300);
    tip = await page.evaluate(() => {
      const t = document.querySelector("[data-testid=dg-tip]");
      if (!t) return null;
      const timeLine = t.querySelector(".dg-tip-time")?.textContent ?? "";
      const m = timeLine.match(/(\d{2}):(\d{2})–(\d{2}):(\d{2})/);
      return { text: t.textContent, timeLine, parsed: m ? m.slice(1).map(Number) : null, hasBp: !!t.querySelector(".dg-tip-bp") };
    });
    if (tip?.parsed) {
      cellIdx = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y)?.closest(".dg-cell");
        return el ? Number(el.dataset.cell) : null;
      }, { x, y });
      if (cellIdx !== null) break;
    }
  }
  if (tip?.parsed && cellIdx !== null) {
    const [h1, m1, h2, m2] = tip.parsed;
    const startMin = h1 * 60 + m1, endMin = h2 * 60 + m2;
    const cellStart = 6 * 60 + cellIdx * 10;
    const inWindow = startMin >= cellStart - 1 && endMin <= cellStart + 10 + 1 && endMin > startMin;
    tipOk = inWindow && !tip.hasBp;
    const p2 = (n) => String(n).padStart(2, "0");
    tipInfo = `格${cellIdx}(${p2(Math.floor(cellStart / 60))}:${p2(cellStart % 60)}窗内) 浮窗="${tip.text}"`;
  }
}
ok("浮窗口径=时间格窗内区间+时长、无断点行", tipOk, tipInfo);
await page.screenshot({ path: `${OUT}/v14-hover-tip.png` });

// ── 6. 半圆/全圆分布（历史日应有半圆出现）──
const dist = await page.evaluate(() => {
  const r = document.querySelector("[data-testid=daygrid-scroll]");
  const units = [...r.querySelectorAll(".day-unit")];
  const withGrid = units.filter((u) => u.querySelector("[data-testid=daygrid]"));
  // 抽 3 个有数据的日统计
  const stats = withGrid.slice(-3).map((u) => {
    const dots = [...u.querySelectorAll("[data-testid=dg-dot]")];
    return { day: u.dataset.day, full: dots.filter((e) => e.classList.contains("dg-dot")).length, half: dots.filter((e) => e.classList.contains("dg-half")).length };
  });
  return stats;
});
const anyHalf = dist.some((s) => s.half > 0);
ok("占用率语义生效（历史日出现半圆）", anyHalf, JSON.stringify(dist));

await browser.close();
const failed = results.filter((r) => !r).length;
console.log(`\n== v1.4 自检 ${results.length - failed}/${results.length} 通过 ==`);
process.exit(failed ? 1 : 0);
