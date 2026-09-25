// 个人记录换行验收：详情栏写两行 → 展示态 white-space=pre-wrap、视觉两行
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=board-page]");
await sleep(700);

// 开详情栏（点活跃行主体）
await page.click("[data-testid=active-row] .row-main");
await page.waitForSelector("[data-testid=detail-panel].open");
await sleep(400);

// 写两行：Enter 换行（multiline 不提交）、Ctrl+Enter 提交
await page.click("[data-testid=notes-area]");
await page.waitForSelector("[data-testid=notes-area-editing]");
await page.keyboard.type("第一行：骨架");
await page.keyboard.press("Enter");
await page.keyboard.type("第二行：风险");
await page.keyboard.press("Control+Enter");
await sleep(500);

const r = await page.evaluate(() => {
  const el = document.querySelector("[data-testid=notes-area]");
  const cs = getComputedStyle(el);
  return {
    text: el.textContent,
    whiteSpace: cs.whiteSpace,
    oneLineH: parseFloat(getComputedStyle(el).fontSize) * 1.55,
    h: el.getBoundingClientRect().height,
  };
});
ok("提交后文本含换行", r.text.includes("第一行") && r.text.includes("第二行"), r.text);
ok("展示态 white-space=pre-wrap", r.whiteSpace === "pre-wrap", r.whiteSpace);
ok("视觉两行（高度 > 1.5 倍行高）", r.h > r.oneLineH * 1.5, `h=${Math.round(r.h)} 单行≈${Math.round(r.oneLineH)}`);
await page.screenshot({ path: "docs/screenshots/v13/notes-newline.png" });

console.log(`\n${results.filter(Boolean).length}/${results.length} 通过`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
