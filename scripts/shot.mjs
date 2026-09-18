// PoC 证据脚本 1：对 vite dev server（Chromium）截 #/ 与 #/rest
// 用法：先起 `pnpm vite dev`，再 `node scripts/shot.mjs`
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://127.0.0.1:14200";
const OUT = "docs/screenshots/poc";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto(`${BASE}/#/`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/dev-home.png` });

await page.goto(`${BASE}/#/rest`);
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/dev-rest.png` });

const backdrop = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="rest-glass"]');
  const cs = getComputedStyle(el);
  return { backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter };
});
console.log("[shot] rest-glass backdrop-filter =", backdrop.backdropFilter);

await browser.close();
console.log("[shot] done -> docs/screenshots/poc/dev-home.png, dev-rest.png");
