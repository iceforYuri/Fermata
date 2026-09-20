// 钉锚帧耗测量：✓ 勾选完成操作窗口内的长任务数 / 最大帧耗 / p95 帧耗
// 用法：node scripts/measure-pin-frames.mjs <标签>（输出 JSON 行，供修复前后对比）
import { chromium } from "playwright";
const label = process.argv[2] ?? "run";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const d = new Date();
const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=tab-stats]");
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=month-cal]");
await sleep(400);
await page.click(`[data-testid=cal-cell][data-day="${ds}"]`);
await page.waitForSelector("[data-testid=dayview]");
await sleep(400);
await page.fill("[data-testid=dv-plan-input]", `帧耗探针${label}`);
await page.press("[data-testid=dv-plan-input]", "Enter");
await sleep(800); // 过创建钉窗

// 摆到计划区头在视口中段
await page.evaluate(() => {
  const sc = document.querySelector("[data-testid=drill-current] .stats-scroll");
  const head = document.querySelector("[data-testid=dv-plans] .detail-label");
  sc.scrollTop = head.getBoundingClientRect().top + sc.scrollTop - sc.getBoundingClientRect().top - 300;
});
await sleep(150);

await page.evaluate(() => {
  window.__lt = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__lt.push(Math.round(e.duration));
  }).observe({ entryTypes: ["longtask"] });
  window.__frames = [];
  let last = performance.now();
  const loop = (t) => {
    window.__frames.push(Math.round((t - last) * 100) / 100);
    last = t;
    if (window.__frames.length < 90) requestAnimationFrame(loop); // ~1.5s
  };
  requestAnimationFrame(loop);
});

const prow = page.locator("[data-testid=dv-plan-row]", { hasText: `帧耗探针${label}` });
await prow.locator("[data-testid=dv-plan-done]").click();
await sleep(1600);

const out = await page.evaluate(() => {
  const frames = window.__frames;
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const over33 = frames.filter((f) => f > 33).length; // 掉帧（<30fps）
  return { longTasks: window.__lt, frames: frames.length, maxFrameMs: max, p95FrameMs: p95, over33 };
});
console.log(JSON.stringify({ label, ...out }));
await browser.close();
