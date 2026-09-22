// 弹层出场动效验收：exiting 类挂载 → 延迟卸载；覆盖断点卡/完成档案/toast/统计详情卡/时间片小卡/休止符窗
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };
const SHOT = "docs/screenshots/v13";

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=board-page]");
await sleep(700);

/** 通用：触发关闭 → 40ms 时应带 .exiting 仍在 DOM；300ms 后应卸载 */
async function expectExit(name, testid, trigger) {
  await trigger();
  await sleep(40);
  const mid = await page.evaluate((t) => {
    const el = document.querySelector(`[data-testid=${t}]`);
    return el ? { present: true, exiting: el.classList.contains("exiting") || !!el.querySelector(".exiting") || !!el.closest(".exiting") } : { present: false, exiting: false };
  }, testid);
  await sleep(320);
  const gone = (await page.locator(`[data-testid=${testid}]`).count()) === 0;
  ok(`${name}：关闭后先播反场（.exiting）再卸载`, mid.present && mid.exiting && gone,
    `40ms: present=${mid.present} exiting=${mid.exiting}；360ms gone=${gone}`);
}

// --- 1. 断点卡 ---
await page.locator("[data-testid=suspended-row] .row-main").nth(1).click();
await page.waitForSelector("[data-testid=bp-card]");
await expectExit("断点卡(Esc)", "bp-card", () => page.keyboard.press("Escape"));

// --- 2. 完成档案（今日已完） ---
await page.click("[data-testid=donebar]");
await page.waitForSelector("[data-testid=archive]");
await expectExit("完成档案(点模糊区)", "archive", () => page.mouse.click(80, 500));
// 补一张再开时的进场对照截图（档案列表本身）
await page.click("[data-testid=donebar]");
await page.waitForSelector("[data-testid=archive]");
await page.screenshot({ path: `${SHOT}/archive-open.png` });
await page.mouse.click(80, 500);
await sleep(400);

// --- 3. 撤销 toast（3s 寿命到期自动反场） ---
await page.locator("[data-testid=suspended-row] .spine").first().click();
await page.waitForSelector("[data-testid=undo-toast]");
await page.click("[data-testid=undo-btn]"); // 撤销 → toast 应播反场
await sleep(40);
const toastMid = await page.evaluate(() => {
  const el = document.querySelector("[data-testid=undo-toast]");
  return el ? { present: true, exiting: el.classList.contains("exiting") } : { present: false, exiting: false };
});
await sleep(320);
const toastGone = (await page.locator("[data-testid=undo-toast]").count()) === 0;
ok("撤销 toast：撤销后先反场再卸载", toastMid.present && toastMid.exiting && toastGone,
  `40ms: ${JSON.stringify(toastMid)}；gone=${toastGone}`);

// --- 4. 统计详情卡 ---
await page.click("[data-testid=tab-stats]");
await sleep(700);
await page.locator("[data-testid=dv-done-row]").first().click();
await page.waitForSelector("[data-testid=stats-detail]");
await sleep(300);
await expectExit("统计详情卡(✕)", "stats-detail", () => page.click("[data-testid=sd-close]"));
await page.click("[data-testid=tab-board]");
await sleep(500);

// --- 5. 时间片小卡 ---
await page.click("[data-testid=time-ring-btn]");
await page.waitForSelector("[data-testid=slice-card]");
await expectExit("时间片小卡(Esc)", "slice-card", () => page.keyboard.press("Escape"));

// --- 6. 休止符弹窗（路由演示实例，验反场类） ---
await page.evaluate(() => { window.location.hash = "#/overlay/restpop"; });
await page.waitForSelector("[data-testid=restpop]");
await sleep(300);
await page.click("[data-testid=rest-defer]");
await sleep(60);
const restMid = await page.evaluate(() => {
  const el = document.querySelector("[data-testid=restpop]");
  return el ? { present: true, exiting: el.classList.contains("exiting") } : { present: false, exiting: false };
});
ok("休止符弹窗：选「暂不休息」先播反场再关窗", restMid.present && restMid.exiting, JSON.stringify(restMid));

console.log(`\n${results.filter(Boolean).length}/${results.length} 通过`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
