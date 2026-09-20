// 人类化点击测试：上一个 morph 动画进行中点击下一项（按住 120ms 释放）
import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=capsule-nav]", { timeout: 15000 });
await page.waitForTimeout(600);

async function humanClick(target, holdMs, settleBeforeMs) {
  await page.waitForTimeout(settleBeforeMs);
  const el = await page.$(`[data-testid=tab-${target}]`);
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
  await page.waitForTimeout(450);
  return page.evaluate(() => document.querySelector(".morph-tab.active")?.dataset.testid);
}

// A. 慢速（动画完全结束后）：基线
let slowOk = 0;
for (let i = 0; i < 10; i++) {
  const cur = await humanClick(i % 2 ? "board" : "stats", 120, 600);
  if (cur === `tab-${i % 2 ? "board" : "stats"}`) slowOk++;
}
console.log(`A 慢速（动画后）: ${slowOk}/10`);

// B. 快速连点（上一动画进行中 + 按住 120ms）
let fastOk = 0;
const seq = ["settings", "stats", "board", "stats", "settings", "board", "stats", "settings", "board", "stats"];
for (const t of seq) {
  const cur = await humanClick(t, 120, 60); // 只等 60ms：上一弹簧必然进行中
  if (cur === `tab-${t}`) fastOk++;
}
console.log(`B 快速连点（动画中）: ${fastOk}/10`);
await browser.close();
