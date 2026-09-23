// restpop 二次弹出复验（真机 + 空库 + 60 倍时间）：第一次弹出可见 → 暂不休息 → 第二次弹出仍可见
import { chromium } from "playwright";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, p, x = "") => { results.push(p); console.log(`${p ? "✓" : "✗ FAIL"} ${n} ${x}`); };

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const pages = ctx.pages();
const main = pages.find((p) => !p.url().includes("overlay"));
const restpop = pages.find((p) => p.url().includes("restpop"));
if (!main || !restpop) {
  console.log("页面未齐", pages.map((p) => p.url()));
  process.exit(1);
}

// 主窗：建一件进程并切到运行
await main.waitForSelector("[data-testid=board-page]", { timeout: 10000 });
await main.click("[data-testid=new-row-input]");
await main.keyboard.type("探针进程");
await main.keyboard.press("Enter");
await sleep(600);
await main.locator("[data-testid=suspended-row] .row-main").first().click();
await sleep(800);
// 空库无活跃进程：点击直接切换（不弹断点卡）；有活跃进程才出卡
if ((await main.locator("[data-testid=bp-card]").count()) > 0) {
  await main.keyboard.press("Enter");
  await sleep(500);
}
ok("探针进程进入运行", (await main.locator("[data-testid=active-row]").count()) === 1);

// 硬模式（到点即弹）+ 60 倍时间
await main.evaluate(() => window.__TAURI_INTERNALS__.invoke("setting_set", { key: "rest_mode", value: "hard" }));
await main.evaluate(() => window.__TAURI_INTERNALS__.invoke("debug_set_time_scale", { factor: 60 }));
await sleep(2000); // 等 10s 同步前先把 settings 吸进来（tick 每秒读 getBoard）
await main.evaluate(() => window.__TAURI_INTERNALS__.invoke("debug_get_time_scale")).then((f) => console.log("倍率:", f));

async function popupState(tag) {
  for (let i = 0; i < 40; i++) {
    const r = await restpop.evaluate(() => {
      const el = document.querySelector("[data-testid=restpop]");
      if (!el) return { found: false };
      const cs = getComputedStyle(el);
      return { found: true, opacity: cs.opacity, text: el.textContent.slice(0, 40) };
    }).catch(() => ({ found: false }));
    if (r.found && r.opacity === "1" && r.text.includes("时间到了")) {
      console.log(`${tag}: opacity=1 "${r.text}"`);
      return r;
    }
    await sleep(1500);
  }
  return null;
}

// 环 45m / 60 = 45s 走满 → 第一次弹出
const first = await popupState("第一次弹出");
ok("第一次弹出：可见且 opacity=1", !!first);
await restpop.click("[data-testid=rest-defer]");
await sleep(1000);
const mid = await restpop.evaluate(() => {
  const el = document.querySelector("[data-testid=restpop]");
  return el ? { opacity: getComputedStyle(el).opacity, cls: el.className } : null;
});
console.log("defer 后 DOM 残留态：", JSON.stringify(mid));
ok("defer 后定格在 exiting（opacity 0，隐藏态）", mid && mid.cls.includes("exiting"));

// 第二次弹出（修复前：opacity 0 定格全透明）
const second = await popupState("第二次弹出");
ok("第二次弹出：可见且 opacity=1（修复生效）", !!second);

console.log(`\n${results.filter(Boolean).length}/${results.length} 通过`);
process.exit(results.every(Boolean) ? 0 : 1);
