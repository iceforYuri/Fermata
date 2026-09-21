// 真实 exe：改时间片后环是否重置满环
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));
await page.waitForSelector("[data-testid=board-page]", { timeout: 15000 });
await page.waitForTimeout(600);

// 休息态兜底
const restBtn = await page.$("[data-testid=rest-continue], .rest-continue");
if (restBtn) { await restBtn.click().catch(() => {}); await page.waitForTimeout(600); }

// 无活跃进程则激活挂起第一行；空板则新建一个进程再激活
if (!(await page.$("[data-testid=time-ring-btn]"))) {
  if (await page.$("[data-pid-main]")) {
    await page.locator("[data-pid-main]").first().click();
    await page.waitForTimeout(400);
    if (await page.$(".micro-card")) await page.keyboard.press("Enter");
  } else {
    // 空板：+ 号新建 → 点它激活
    await page.click("[data-testid=new-row-input]");
    await page.keyboard.type("片长重置验证");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await page.locator("[data-pid-main]").first().click();
    await page.waitForTimeout(400);
    if (await page.$(".micro-card")) await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(600);
}
await page.waitForSelector("[data-testid=time-ring-btn]", { timeout: 8000 });

const read = () => page.evaluate(() => {
  const btn = document.querySelector("[data-testid=time-ring-btn]");
  const arc = [...btn.querySelectorAll("circle")].map((c) => c.getAttribute("stroke-dashoffset"));
  return { label: btn.textContent.trim(), arc: arc[1] };
});

await page.waitForTimeout(3000); // 让环走一会
const before = await read();
console.log("改前:", JSON.stringify(before));

await page.click("[data-testid=time-ring-btn]");
await page.waitForSelector("[data-testid=slice-opt-90]");
await page.click("[data-testid=slice-opt-90]");
await page.waitForTimeout(800);
const after = await read();
console.log("改 90m 后:", JSON.stringify(after));

// 重置成功 = 读数 ≈90 且弧 offset ≈0（满环）
const labelOk = after.label.startsWith("90");
const arcOk = Math.abs(parseFloat(after.arc)) < 8;
console.log(labelOk && arcOk ? "重置满环 PASS" : "FAIL（只加上限）");
await page.screenshot({ path: "docs/screenshots/v12/slice-reset.png" });
await browser.close();
process.exit(labelOk && arcOk ? 0 : 1);
