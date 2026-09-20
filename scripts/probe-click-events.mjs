// 点击事件级验证：页面装 mousedown/mouseup/click 监听，真实点击，读页面所见
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const PROBE = "scripts/input-probe/target/release/input-probe.exe";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=capsule-nav]", { timeout: 15000 });

await page.evaluate(() => {
  window.__ev = [];
  for (const t of ["mousedown", "mouseup", "click", "pointerdown", "pointerup"]) {
    document.addEventListener(t, (e) => {
      window.__ev.push(`${t}@(${e.clientX},${e.clientY}) ${(e.target.className || e.target.tagName).toString().slice(0, 30)}`);
    }, true);
  }
});

execFileSync(PROBE, ["topmost"]);
await page.waitForTimeout(400);

// 真实点击 stats tab（物理坐标已验证映射精确）
await page.evaluate(() => (window.__ev = []));
console.log(execFileSync(PROBE, ["826", "66", "click"], { encoding: "utf8" }).trim());
await page.waitForTimeout(600);
const ev = await page.evaluate(() => window.__ev);
console.log("页面收到的事件:", JSON.stringify(ev, null, 1));
const cur = await page.evaluate(() => document.querySelector(".morph-tab.active")?.dataset.testid);
console.log("active tab:", cur);
await browser.close();
