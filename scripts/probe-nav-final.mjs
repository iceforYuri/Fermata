// 终验：正确映射（clientOrigin + css×dpr）下真实输入点击三个 tab
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const PROBE = "scripts/input-probe/target/release/input-probe.exe";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=capsule-nav]", { timeout: 15000 });
await page.waitForTimeout(800);

// 客户区原点（物理）+ DPR
const where = execFileSync(PROBE, ["where"], { encoding: "utf8" });
const mOrigin = where.match(/clientOrigin=(\d+),(\d+)/);
const [ox, oy] = [Number(mOrigin[1]), Number(mOrigin[2])];
const dpr = await page.evaluate(() => devicePixelRatio);
console.log(`clientOrigin=(${ox},${oy}) dpr=${dpr}`);

const geo = await page.evaluate(() => Object.fromEntries(["board", "stats", "settings"].map((k) => {
  const r = document.querySelector(`[data-testid=tab-${k}]`).getBoundingClientRect();
  return [k, [r.left + r.width / 2, r.top + r.height / 2]];
})));

let ok = 0, total = 0;
for (const target of ["stats", "settings", "board", "stats", "board", "settings"]) {
  const [cx, cy] = geo[target];
  const px = Math.round(ox + cx * dpr), py = Math.round(oy + cy * dpr);
  const out = execFileSync(PROBE, [String(px), String(py), "click"], { encoding: "utf8" }).trim();
  await page.waitForTimeout(700);
  const cur = await page.evaluate(() => document.querySelector(".morph-tab.active")?.dataset.testid);
  const pass = cur === `tab-${target}`;
  total++; if (pass) ok++;
  console.log(`真实点击 ${target} @(${px},${py}) ${out} → ${cur} ${pass ? "✓" : "✗"}`);
}
console.log(`成功率: ${ok}/${total}`);
await browser.close();
process.exit(ok === total ? 0 : 1);
