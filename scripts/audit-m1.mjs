// M1 视觉规格审计：对 mock 页面逐项量取 computed style，对照定稿参数
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:14200";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.waitForTimeout(400);

const audit = await page.evaluate(() => {
  const pick = (sel, props) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const out = { h: Math.round(r.height * 10) / 10 };
    for (const p of props) out[p] = cs[p];
    return out;
  };
  return {
    header: pick("[data-testid=board-header]", ["fontSize"]),
    donebar: pick("[data-testid=donebar]", ["fontSize"]),
    active: pick("[data-testid=active-row]", ["borderRadius"]),
    activeTitle: pick("[data-testid=active-row] .active-title", ["fontSize", "fontWeight"]),
    step: pick("[data-testid=current-step]", ["fontSize", "fontWeight"]),
    spine: pick("[data-testid=active-row] .spine", ["width"]),
    suspended: pick("[data-testid=suspended-row]", []),
    suspendedTitle: pick("[data-testid=suspended-row] .suspended-title", ["fontSize"]),
    ring: pick("[data-testid=time-ring]", []),
    newRow: pick("[data-testid=new-row]", []),
    agingOpacities: [...document.querySelectorAll("[data-testid=suspended-row]")].map((el) => ({
      pid: el.dataset.pid,
      state: el.dataset.state,
      opacity: getComputedStyle(el).opacity,
    })),
    ringLabel: document.querySelector("[data-testid=time-ring] .ring-label")?.textContent,
  };
});
console.log(JSON.stringify(audit, null, 2));
await browser.close();
