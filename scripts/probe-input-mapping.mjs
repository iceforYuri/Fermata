// 直接测量 OS→WebView2 坐标映射：页面装监听，真实移动光标，读页面所见
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const PROBE = "scripts/input-probe/target/release/input-probe.exe";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=capsule-nav]", { timeout: 15000 });

await page.evaluate(() => {
  window.__mm = [];
  document.addEventListener("mousemove", (e) => {
    window.__mm.push([e.clientX, e.clientY, (e.target.className || e.target.tagName).toString().slice(0, 40)]);
    if (window.__mm.length > 50) window.__mm.shift();
  }, true);
});

execFileSync(PROBE, ["topmost"]); // 还原+置顶
await page.waitForTimeout(500);

// 把光标移到一组已知物理点，读页面所见
for (const [px, py] of [[746, 66], [826, 66], [871, 66], [640, 500]]) {
  await page.evaluate(() => (window.__mm = []));
  execFileSync(PROBE, [String(px), String(py)]);
  await page.waitForTimeout(300);
  const seen = await page.evaluate(() => window.__mm.slice(-2));
  console.log(`phys(${px},${py}) → 页面所见:`, JSON.stringify(seen));
}
await browser.close();
