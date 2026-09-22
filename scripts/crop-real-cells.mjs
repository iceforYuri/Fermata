// 裁真实数据今日（2026-09-22）有标记的格子，逐个 ASCII 化看方向
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 确保在日视角且今天可见
if (!(await page.$("[data-testid=daygrid-scroll]"))) {
  await page.click("[data-testid=tab-stats]");
  await page.waitForSelector("[data-testid=month-cal]");
  await sleep(500);
  const d = new Date();
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
  await page.waitForSelector("[data-testid=daygrid-scroll]");
  await sleep(800);
}
// 滚到今天单元
await page.evaluate(() => {
  const d = new Date();
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  document.querySelector(`[data-day="${ds}"]`)?.scrollIntoView({ block: "center" });
});
await sleep(600);

const cells = await page.evaluate(() => {
  const d = new Date();
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const unit = document.querySelector(`[data-day="${ds}"]`);
  const out = [];
  unit.querySelectorAll(".dg-cell").forEach((cell) => {
    if (cell.querySelector("svg") || cell.querySelector(".dg-dot")) {
      const r = cell.getBoundingClientRect();
      out.push({ cell: cell.getAttribute("data-cell"), x: r.x, y: r.y, w: r.width, h: r.height });
    }
  });
  return out;
});
console.log("有标记格:", cells.map((c) => c.cell).join(","));
for (const c of cells) {
  await page.screenshot({
    path: `docs/screenshots/v12/real-cell-${c.cell}.png`,
    clip: { x: c.x + c.w / 2 - 18, y: c.y + c.h / 2 - 18, width: 36, height: 36 },
  });
}
console.log("已截", cells.length, "张");
process.exit(0);
