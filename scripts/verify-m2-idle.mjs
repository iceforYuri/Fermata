// M2-f 空闲回归确认：GIKA_IDLE_SECS=5 实例 + 独立空库
// 确定性流程：先注入活动(非空闲) → 建进程切换 → 静置 7s → idle 起 → 注入活动 → 回归确认卡 → 答"是"回补
import { chromium } from "playwright";
import { execSync } from "node:child_process";

const nudge = () =>
  execSync("powershell -NoProfile -ExecutionPolicy Bypass -File scripts/inject-ctrl.ps1");

const browser = await chromium.connectOverCDP("http://localhost:9222");
process.on("unhandledRejection", () => {});
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes("127.0.0.1:14200") && !p.url().includes("window="));
if (!page) process.exit(1);
page.on("console", (m) => m.text().includes("idle-dbg") && console.log(m.text()));
const inv = (cmd, args = {}) =>
  page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const d = new Date();
const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const t0 = Date.now();
await page.waitForSelector("[data-testid=board-page]", { timeout: 20000 });
await page.reload(); // 清掉页面本地状态（如残留的空闲确认卡）
await page.waitForSelector("[data-testid=board-page]", { timeout: 20000 });
try { nudge(); } catch { /* 注入抖动可忍，非断言点 */ } // 活动基线：现在不空闲
await sleep(1500);
const pid = await inv("process_create", { title: "M2空闲验收", boardDate: day });
await inv("process_switch", { pid });
await sleep(500);
const switchTs = Date.now();

// 静置 7s（>5s 阈值）→ idle_start 闭段、环变暗
await sleep(7000);
const evts1 = (await inv("q_events", {})).filter((e) => e.ts > t0);
const idleStart = evts1.findLast((e) => e.kind === "idle_start");
const dimmed = await page
  .$eval("[data-testid=time-ring]", (el) => el.classList.contains("dimmed"))
  .catch(() => false);
console.log(`[idle] idle_start=${!!idleStart} 环变暗=${dimmed}`);

// 注入活动（本机注入接受率抖动，循环直到 idle_current 真翻转）→ idle_end + 确认卡
let flipped = false;
for (let i = 0; i < 30 && !flipped; i++) {
  try { nudge(); } catch { /* 注入被吞则重试 */ }
  await sleep(1200);
  flipped = !(await inv("idle_current", {}));
}
console.log(`[idle] 注入翻转 idle=${flipped}`);
let cardShown = false;
for (let i = 0; i < 14 && !cardShown; i++) {
  await sleep(500);
  cardShown = !!(await page.$("[data-testid=idle-card]"));
}
if (!cardShown) throw new Error("idle card never showed");
await page.screenshot({ path: "docs/screenshots/m2/wv2-idle-confirm.png" });
console.log("[idle] 确认卡出现，截图 wv2-idle-confirm.png");

// 答"是" → 空闲段回补（合并 segment：开口段起点≈切换时刻）
await page.click("[data-testid=idle-yes]");
await sleep(800);
const segs = await inv("q_segments", { pid, day });
const evts2 = (await inv("q_events", {})).filter((e) => e.ts > t0);
const idleEnd = evts2.findLast((e) => e.kind === "idle_end");
const idleConfirm = evts2.findLast((e) => e.kind === "idle_confirm");
const openSegs = segs.filter((s) => s.ended_at === null);
const merged =
  openSegs.length === 1 && Math.abs(openSegs[0].started_at - switchTs) < 4000;

const pass =
  !!idleStart &&
  dimmed &&
  !!idleEnd &&
  idleConfirm?.payload?.includes("true") &&
  idleStart.ts < idleEnd.ts &&
  idleEnd.ts < idleConfirm.ts &&
  merged;
console.log(
  `[idle] 事件序 idle_start→idle_end→idle_confirm(yes)=${!!idleStart && !!idleEnd && !!idleConfirm}，合并开口段=${merged}`,
);
console.log(pass ? "== f) 空闲回归确认 PASS ==" : "== f) FAIL ==");
await browser.close();
process.exit(pass ? 0 : 1);
