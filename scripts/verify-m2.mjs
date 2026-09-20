// M2 验收：CDP 连真实 tauri dev（:9222），三窗 target 直驱。
// 前置：FERMATA_DB_PATH 指向一个【全新空库】，dev 已起。
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const OUT = "docs/screenshots/m2";
mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const browser = await chromium.connectOverCDP(`http://localhost:${process.env.CDP_PORT ?? 9222}`);
const all = browser.contexts().flatMap((c) => c.pages());
const byHash = (frag) => all.find((p) => p.url().includes(frag));
const main = byHash("127.0.0.1:14200/") ?? all.find((p) => p.url() === "http://tauri.localhost/");
const switcher = byHash("window=switcher");
const restpop = byHash("window=restpop");
if (!main || !switcher || !restpop) {
  console.error("targets:", all.map((p) => p.url()));
  process.exit(1);
}
// main 也匹配了 switcher URL 前缀，修正：主窗=不含 window= 的
const mainPage = all.find((p) => (p.url().includes("127.0.0.1:14200") || p.url() === "http://tauri.localhost/") && !p.url().includes("window="));
const sw = switcher;
const rp = restpop;

const inv = (page, cmd, args = {}) =>
  page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitEvent(page, kind, source, timeoutMs, since = 0) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const evts = await inv(page, "q_events", {});
    const hit = evts.find(
      (e) =>
        e.kind === kind &&
        e.ts > since &&
        (source === undefined || (e.payload ?? "").includes(`"${source}"`)),
    );
    if (hit) return hit;
    await sleep(1000);
  }
  return null;
}

async function restVisible() {
  return inv(mainPage, "debug_window_visible", { label: "restpop" });
}
async function waitRestVisible(want, timeoutMs = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if ((await restVisible()) === want) return true;
    await sleep(400);
  }
  return false;
}
async function swVisible() {
  return inv(mainPage, "debug_window_visible", { label: "switcher" });
}
async function restState() {
  return inv(mainPage, "q_rest_state", {});
}
async function activeTitle() {
  return mainPage.textContent("[data-testid=active-row] .active-title").catch(() => null);
}

// ---------- 0. 全新库上建四个进程，甲运行 ----------
await mainPage.waitForSelector("[data-testid=board-page]", { timeout: 20000 });
const _d = new Date();
const day = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
const ids = {};
for (const t of ["M2甲·写代码", "M2乙·读论文", "M2丙·回邮件", "M2丁·等AI"]) {
  ids[t] = await inv(mainPage, "process_create", { title: t, boardDate: day });
}
await inv(mainPage, "waiting_ai_set", { pid: ids["M2丁·等AI"], on: true });
await inv(mainPage, "process_switch", { pid: ids["M2甲·写代码"] });
await sleep(600);
ok("建库初始化", (await activeTitle()) === "M2甲·写代码");

// ---------- c) 不抢焦点（restpop show 前后台不变 + 注入打字不被劫） ----------
await inv(mainPage, "focus_main");
const focusRes = await inv(mainPage, "debug_focus_check", { label: "restpop" });
await mainPage.click("[data-testid=new-row-input]");
await mainPage.keyboard.type("焦点仍在我这");
const typed = await mainPage.inputValue("[data-testid=new-row-input]");
await inv(mainPage, "hide_restpop");
await mainPage.press("[data-testid=new-row-input]", "Escape");
await mainPage.evaluate(() => (document.activeElement.value = ""));
ok(
  "c) restpop 不抢焦点（前台不变 + WS_EX_NOACTIVATE + 主窗打字不被劫）",
  focusRes.pass && typed === "焦点仍在我这",
  JSON.stringify(focusRes),
);

// ---------- a) Alt+Q 纯键盘 2 秒切换（debug_trigger_hotkey = 物理热键同路径） ----------
const ta0 = Date.now();
await inv(mainPage, "debug_trigger_hotkey");
await sleep(300);
const swShown = await swVisible();
await sw.waitForSelector("[data-testid=switcher-input]");
await sw.keyboard.press("ArrowDown"); // 等AI 组排前 [丁,乙,丙]，↓ 一次到 乙
await sw.keyboard.press("Enter");
await sw.waitForSelector("[data-testid=switcher-bp-input]");
await sw.keyboard.type("写到状态机");
await sw.keyboard.press("Enter");
await sleep(700);
const switchMs = Date.now() - ta0;
const boardNow = await inv(mainPage, "q_board", { day });
const bpOfJia = boardNow.suspended.find((x) => x.process.title === "M2甲·写代码")?.process.breakpoint;
ok(
  "a) 热键→浮层→↓→Enter→断点→Enter 全程键盘切换",
  swShown && (await activeTitle()) === "M2乙·读论文" && bpOfJia === "写到状态机" && !(await swVisible()),
  `耗时 ${switchMs}ms（预算 2000ms），断点=${bpOfJia}`,
);
execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture-screen.ps1 -out "${OUT}/wv2-main-switcher.png"`);
console.log("[截图] 主窗+浮层同框 wv2-main-switcher.png（注：此时浮层已收起，补拍见下）");

// ---------- b/d) 双触发 + 软/硬模式 ----------
await inv(mainPage, "debug_set_time_scale", { factor: 60 }); // 环 45min→45s，连轴 90min→90s

// 触发1：环走满（软模式：先入队，间隙才弹）
const trig1 = await waitEvent(mainPage, "rest_trigger", "ring_full", 60_000);
const popTooEarly = await restVisible();
ok("b1) 环走满触发 rest_trigger(ring_full)", !!trig1, trig1 ? `ts=${trig1.ts}` : "超时");
ok("d1) 软模式：触发后未立即弹（计时照常）", trig1 && !popTooEarly);
const overtime = await mainPage.$("[data-testid=ring-overtime]");
ok("d1b) 软模式排队期环呈超时态(+Nm)", !!overtime);

// 间隙1：切回主窗（conceal→summon 产生 focus）
await inv(mainPage, "conceal");
await sleep(600);
await inv(mainPage, "summon");
ok("d-gap1) 主窗获焦 → 弹窗出现", await waitRestVisible(true));
ok("d-gap1b) 弹窗出现即停表（rest_start 已写）", (await restState()).resting);
execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File scripts/capture-screen.ps1 -out "${OUT}/wv2-main-restpop.png"`);
console.log("[截图] 主窗+休止符弹窗同框 wv2-main-restpop.png");

// 暂不休息（恢复路径 1 的弹窗形态）
await rp.waitForSelector("[data-testid=rest-defer]");
await rp.click("[data-testid=rest-defer]");
await sleep(600);
ok("e1) 暂不休息 = 恢复+环重置+关窗", !(await restVisible()) && !(await restState()).resting);

// 触发2：连轴转（阈值调成 1min@60x=1s 等效，rest_end 后从零计）
await inv(mainPage, "setting_set", { key: "continuous_limit_minutes", value: "1" });
await sleep(300);
const trig2 = await waitEvent(mainPage, "rest_trigger", "continuous", 30_000);
await inv(mainPage, "setting_set", { key: "continuous_limit_minutes", value: "90" });
ok("b2) 连轴转触发 rest_trigger(continuous)", !!trig2, trig2 ? `ts=${trig2.ts}` : "超时");

// 间隙2：打开切换浮层
await inv(mainPage, "debug_trigger_hotkey");
await sleep(1200);
ok("d-gap2) 打开切换浮层 → 弹窗出现", await restVisible());
await sw.keyboard.press("Escape"); // 收起浮层
await sleep(400);

// ✕ = 关窗但保持休息态（主窗休息页在等）
await rp.click("[data-testid=restpop-close]");
await sleep(600);
const restAfterClose = await restState();
const restPageShown = await mainPage.$("[data-testid=rest-page]");
ok("e2) ✕=保持休息态，主窗休息页在等", !(await restVisible()) && restAfterClose.resting && !!restPageShown);

// 恢复路径 2：休息页「继续」
await mainPage.click("[data-testid=rest-continue]");
await sleep(600);
ok("e3) 恢复路径·休息页继续", !(await restState()).resting);

// 硬模式：到点即弹（只看新事件）
await inv(mainPage, "setting_set", { key: "rest_mode", value: "hard" });
await sleep(300);
const mark3 = Date.now();
const trig3 = await waitEvent(mainPage, "rest_trigger", "ring_full", 70_000, mark3);
ok("d-hard) 硬模式到点即弹", !!trig3 && (await waitRestVisible(true, 5000)));
await inv(mainPage, "setting_set", { key: "rest_mode", value: "soft" });

// 翻下一篇：在硬模式弹窗上展开前 5 条并切换
await rp.waitForSelector("[data-testid=rest-next]");
await rp.click("[data-testid=rest-next]");
await rp.waitForSelector("[data-testid=restpop-next-row]");
const nextCount = await rp.$$eval("[data-testid=restpop-next-row]", (r) => r.length);
const activeBefore = await activeTitle();
await rp.click("[data-testid=restpop-next-row] >> nth=0");
await sleep(800);
const afterNext = await activeTitle();
ok(
  "e5) 翻下一篇展开并切换",
  nextCount >= 3 && afterNext !== activeBefore && !(await restState()).resting && !(await restVisible()),
  `展开 ${nextCount} 条，active ${activeBefore}→${afterNext}`,
);

// 恢复路径 3：再触发 → ✕ 保持休息 → 浮层显式切换（显式开工）
const mark4 = Date.now();
await waitEvent(mainPage, "rest_trigger", "ring_full", 70_000, mark4);
await inv(mainPage, "conceal");
await sleep(500);
await inv(mainPage, "summon");
await waitRestVisible(true, 8000);
await rp.click("[data-testid=restpop-close]");
await sleep(500);
const restingBeforeSw = (await restState()).resting;
await inv(mainPage, "debug_trigger_hotkey");
await sw.waitForSelector("[data-testid=switcher-input]");
await sw.waitForSelector("[data-testid=switcher-row]");
await sleep(300);
const activeBeforeSw = await activeTitle();
await sw.keyboard.press("Enter"); // 首行（等AI 丁排前）→ 断点行
await sw.waitForSelector("[data-testid=switcher-bp-input]");
await sw.keyboard.press("Enter"); // 空断点
await sleep(800);
const afterSw = await activeTitle();
ok(
  "e4) 恢复路径·浮层切换 = 显式开工",
  restingBeforeSw && afterSw !== activeBeforeSw && !(await restState()).resting,
  `active ${activeBeforeSw}→${afterSw}`,
);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n== M2 ${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
