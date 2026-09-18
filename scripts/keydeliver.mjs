// 注入按键投递域定：attach 挂 keydown 监听 / read 读结果
import { chromium } from "playwright";
const mode = process.argv[2];
const browser = await chromium.connectOverCDP("http://localhost:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes("127.0.0.1:14200") && !p.url().includes("poc-popup"));
if (!page) {
  console.log("no page");
  process.exit(1);
}
if (mode === "attach") {
  await page.evaluate(() => {
    window.__keys = [];
    window.addEventListener("keydown", (e) => window.__keys.push(e.key));
  });
  console.log("listener attached");
} else {
  const keys = await page.evaluate(() => window.__keys);
  console.log("keys received:", JSON.stringify(keys));
}
await browser.close();
