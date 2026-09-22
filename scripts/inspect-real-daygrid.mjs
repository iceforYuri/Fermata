// 真实数据日网格体检：列出今天所有有标记的格（格号/枚数/色/方向），截整图
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.waitForSelector("[data-testid=tab-stats]", { timeout: 15000 });
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await sleep(600);
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.dblclick(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=daygrid-scroll]");
await sleep(900);

const dump = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll("[data-testid=day-unit]").forEach((unit) => {
    const day = unit.getAttribute("data-day");
    unit.querySelectorAll(".dg-cell").forEach((cell) => {
      const svg = cell.querySelector("svg");
      const dot = cell.querySelector(".dg-dot");
      if (!svg && !dot) return;
      const circles = [...cell.querySelectorAll("svg circle[clip-path]")];
      const outline = cell.querySelector("svg circle[stroke]");
      out.push({
        day,
        cell: cell.getAttribute("data-cell"),
        kind: circles.length ? `split${circles.length}` : dot && !svg ? "full" : "half+outline",
        fills: circles.map((c) => c.getAttribute("fill")),
        clip: circles.map((c) => c.getAttribute("clip-path")),
        stroke: outline ? outline.getAttribute("stroke") : null,
      });
    });
  });
  return out;
});
console.log(JSON.stringify(dump, null, 1));
await page.screenshot({ path: "docs/screenshots/v12/real-daygrid-full.png" });
process.exit(0);
