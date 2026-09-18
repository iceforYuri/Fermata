// PoC 证据脚本 2：连真实 WebView2（CDP :9222）
// 依次实证：原语B 玻璃（截图+像素采样）、原语A 焦点断言、原语C 热键事件
// 前提：`pnpm tauri dev` 以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 启动
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "docs/screenshots/poc";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://localhost:9222");
const pages = browser.contexts().flatMap((c) => c.pages());
const page = pages.find(
  (p) => p.url().includes("127.0.0.1:14200") && !p.url().includes("poc-popup"),
);
if (!page) {
  console.error("[wv2] 未找到主窗页面，targets:", pages.map((p) => p.url()));
  process.exit(1);
}
console.log("[wv2] 已连接主窗:", page.url());
const dpr = await page.evaluate(() => window.devicePixelRatio);
console.log("[wv2] devicePixelRatio =", dpr);

// ---------- 原语B：页内 backdrop-filter ----------
await page.evaluate(() => (window.location.hash = "#/rest"));
await page.waitForTimeout(600);

const computed = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('[data-testid="rest-glass"]'));
  return cs.backdropFilter || cs.webkitBackdropFilter;
});
console.log("[wv2] backdrop-filter computed =", computed);

const stripeInfo = await page.evaluate(() =>
  [...document.querySelectorAll("[data-stripe]")].slice(0, 2).map((el) => {
    const r = el.getBoundingClientRect();
    return { color: el.dataset.stripe, x: r.x, y: r.y, w: r.width, h: r.height };
  }),
);

const shotGlass = await page.screenshot();
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="rest-glass"]');
  el.style.backdropFilter = "none";
  el.style.webkitBackdropFilter = "none";
});
await page.waitForTimeout(300);
const shotNoGlass = await page.screenshot();
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="rest-glass"]');
  el.style.backdropFilter = "";
  el.style.webkitBackdropFilter = "";
});
writeFileSync(`${OUT}/wv2-rest.png`, shotGlass);
writeFileSync(`${OUT}/wv2-rest-noglass.png`, shotNoGlass);

function px(png, x, y) {
  const i = (Math.round(y) * png.width + Math.round(x)) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 过渡带宽度：跨越两条纹边界，统计既不像上纹也不像下纹的"混合像素"数量
function transitionWidth(buf, x, yFrom, yTo) {
  const png = PNG.sync.read(buf);
  const c1 = px(png, x, yFrom);
  const c2 = px(png, x, yTo);
  let soft = 0;
  for (let y = yFrom; y <= yTo; y++) {
    const c = px(png, x, y);
    if (dist(c, c1) > 24 && dist(c, c2) > 24) soft++;
  }
  return soft;
}

const [s0, s1] = stripeInfo;
const sampleX = (s0.x + s0.w / 2) * dpr;
const yFrom = (s0.y + s0.h / 2) * dpr;
const yTo = (s1.y + s1.h / 2) * dpr;
const softGlass = transitionWidth(shotGlass, sampleX, yFrom, yTo);
const softNoGlass = transitionWidth(shotNoGlass, sampleX, yFrom, yTo);
const pure = s0.color.match(/\w\w/g).map((h) => parseInt(h, 16));
const pngGlass = PNG.sync.read(shotGlass);
const blended = px(pngGlass, sampleX, yFrom);
const blurPass = computed.includes("blur(20px)") && softGlass > softNoGlass + 4 && dist(blended, pure) > 10;
console.log(
  `[wv2] 原语B: computed="${computed}" 过渡带(玻璃开)=${softGlass}px 过渡带(玻璃关)=${softNoGlass}px ` +
    `条纹心采样=${blended} vs 原色=${pure} => ${blurPass ? "PASS" : "FAIL"}`,
);

// ---------- 原语A：不抢焦点弹窗 ----------
await page.evaluate(() => (window.location.hash = "#/overlay/poc-popup-trigger"));
await page.waitForTimeout(400);
await page.click('[data-testid="spawn-popup-btn"]');
await page.waitForSelector('[data-testid="focus-result"]', { timeout: 10000 });
await page.waitForTimeout(300);
const focusResult = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="focus-result"]');
  return { pass: el.dataset.pass === "true", text: el.innerText };
});
console.log(`[wv2] 原语A => ${focusResult.pass ? "PASS" : "FAIL"}`);
console.log(focusResult.text);
writeFileSync(`${OUT}/focus-test-result.json`, JSON.stringify(focusResult, null, 2));
await page.screenshot({ path: `${OUT}/wv2-focus.png` });

// 桌面级截图：主窗 + 实心暖卡弹窗同框
execSync(
  `powershell -NoProfile -File scripts/capture-screen.ps1 -out "${OUT}/wv2-popup-desktop.png"`,
);
console.log("[wv2] 桌面截图已存 wv2-popup-desktop.png");

// ---------- 原语C：热键 Alt+Q ----------
// 注：本机环境过滤注入输入（见 hotkey-probe3/4/5 证据），此处如实记录注入尝试与结果
await page.evaluate(() => (window.location.hash = "#/"));
await page.waitForTimeout(400);
execSync(
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/send-altq.ps1`,
);
await page.waitForTimeout(1000);
const hotkeyLog = await page.evaluate(
  () => document.querySelector('[data-testid="hotkey-log"]').innerText,
);
const hotkeyFired = !hotkeyLog.includes("尚未收到");
console.log(
  `[wv2] 原语C 热键 => ${hotkeyFired ? "PASS（前端已收到事件）" : "注入未触发（环境过滤注入输入，见 probe 日志）"}: ${hotkeyLog.trim()}`,
);
await page.screenshot({ path: `${OUT}/wv2-hotkey.png` });

writeFileSync(
  `${OUT}/wv2-verdicts.json`,
  JSON.stringify(
    {
      backdropFilter: { computed, softGlass, softNoGlass, blended, pure, pass: blurPass },
      focus: focusResult,
      hotkey: { log: hotkeyLog.trim(), pass: hotkeyFired, note: "injection-filtered-environment" },
    },
    null,
    2,
  ),
);
await browser.close();
console.log("[wv2] done");
