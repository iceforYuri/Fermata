// 休息旁路收口验收：休息中经切换浮层切走 → 先 rest_end 再 switch_in，休息态退出
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=board-page]");
await sleep(600);

// 注入休息态（模拟休止符已触发、弹窗层级的 resting=true）
await page.evaluate(() => {
  const m = window.__mock;
  m.resting = true;
  m.restSince = Date.now() - 5 * 60_000;
  m.restSource = "探针注入";
  m.events.push({ id: m.events.length + 1, ts: Date.now() - 5 * 60_000, kind: "rest_start", process_id: null, payload: "{}" });
});
console.log("等待 store 10s 同步 rest 态…");
await sleep(11_000);

// 打开切换浮层（路由可达），直选第一行切走
await page.evaluate(() => { window.location.hash = "#/overlay/switcher"; });
await page.waitForSelector("[data-testid=switcher]");
await sleep(300);
await page.keyboard.press("1");
await sleep(400);
// 断点内嵌：若出现断点输入行，Enter 确认走人
if ((await page.locator("[data-testid=switcher-bp-input]").count()) > 0) {
  await page.keyboard.press("Enter");
  await sleep(500);
}

const r = await page.evaluate(() => {
  const m = window.__mock;
  const kinds = m.events.map((e) => e.kind);
  const restEndIdx = kinds.lastIndexOf("rest_end");
  const switchInIdx = kinds.lastIndexOf("switch_in");
  return { restEndIdx, switchInIdx, resting: m.resting };
});
ok("切走先 rest_end 再 switch_in", r.restEndIdx >= 0 && r.switchInIdx > r.restEndIdx,
  `rest_end@${r.restEndIdx} switch_in@${r.switchInIdx}`);
ok("休息态已退出", r.resting === false, `resting=${r.resting}`);

console.log(`\n${results.filter(Boolean).length}/${results.length} 通过`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
