// M1 真实数据接线验证（CDP :9222 对 tauri dev）：切换/暂停继续/撤销 全链路打真库
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://localhost:9222");
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("127.0.0.1:14200"));
if (!page) process.exit(1);
await page.waitForSelector("[data-testid=board-page]", { timeout: 20000 });
await page.waitForTimeout(600);

const read = async () => ({
  active: await page.textContent("[data-testid=active-row] .active-title").catch(() => null),
  ring: await page.textContent("[data-testid=time-ring] .ring-label").catch(() => null),
  queue: await page.$$eval("[data-testid=suspended-row] .suspended-title", (els) => els.map((e) => e.textContent)),
});

const s0 = await read();
console.log("[wv2] 初始:", JSON.stringify(s0));

// 切换：点挂起首行 → 成为运行
await page.click("[data-testid=suspended-row] .row-main");
await page.waitForTimeout(800);
const s1 = await read();
console.log("[wv2] 切换后:", JSON.stringify({ active: s1.active, queueLen: s1.queue.length }));

// 暂停 → 环变暗
await page.click("[data-testid=pause-btn]");
await page.waitForTimeout(600);
const dimmed = await page.$eval("[data-testid=time-ring]", (el) => el.classList.contains("dimmed"));
console.log("[wv2] 暂停后环变暗:", dimmed);
await page.click("[data-testid=pause-btn]"); // 恢复
await page.waitForTimeout(600);

// 撤销流：完成运行中进程 → 撤销 → 回来
await page.click("[data-testid=active-row] [data-testid=confirm-spine]");
await page.waitForSelector("[data-testid=undo-toast]");
await page.click("[data-testid=undo-btn]");
await page.waitForTimeout(800);
const s2 = await read();
console.log("[wv2] 撤销后:", JSON.stringify({ active: s2.active }));

const pass =
  s1.active === s0.queue[0] && dimmed && s2.active === s1.active && (s1.ring === "45" || s1.ring === "44");
console.log(`[wv2] 真实接线 ${pass ? "PASS" : "CHECK"}`);
await browser.close();
process.exit(pass ? 0 : 1);
