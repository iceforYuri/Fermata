// M4 真实环境验证（CDP :9222）：主题跨窗生效 / 置顶 / 热键重注册 / 导出文件
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";

const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const browser = await chromium.connectOverCDP(`http://localhost:${process.env.CDP_PORT ?? 9222}`);
const all = browser.contexts().flatMap((c) => c.pages());
const main = all.find((p) => (p.url().includes("14200") || p.url() === "http://tauri.localhost/") && !p.url().includes("window="));
const sw = all.find((p) => p.url().includes("window=switcher"));
if (!main || !sw) process.exit(1);
const inv = (page, cmd, args = {}) =>
  page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await main.waitForSelector("[data-testid=board-page]", { timeout: 30000 });

// 1. 主题切换：主窗 + 浮窗同时生效
await inv(main, "setting_set", { key: "theme", value: "dark" });
await sleep(800);
const tMain = await main.evaluate(() => document.documentElement.dataset.theme);
const tSw = await sw.evaluate(() => document.documentElement.dataset.theme);
ok("主题即切全窗（主窗+浮层同步）", tMain === "dark" && tSw === "dark", `main=${tMain} sw=${tSw}`);
await inv(main, "setting_set", { key: "theme", value: "light" });
await sleep(500);

// 2. 置顶开关：即切即生效
await inv(main, "pin", { on: true });
await sleep(300);
const top1 = await inv(main, "debug_always_on_top");
await inv(main, "pin", { on: false });
await sleep(300);
const top2 = await inv(main, "debug_always_on_top");
ok("置顶开关即切即生效", top1 === true && top2 === false, `on=${top1} off=${top2}`);

// 3. 热键重注册：Alt+Q → Ctrl+Shift+K（物理按键本机不可自动化，PoC 已证；验证注册调用成功+设置落库+回滚路径）
await inv(main, "setting_set", { key: "hotkey", value: "Ctrl+Shift+K" });
const apply1 = await inv(main, "hotkey_apply").then(() => "ok").catch((e) => String(e));
ok("热键重注册成功", apply1 === "ok", apply1);
// 非法组合回滚由前端负责（mock 已验）；此处验证非法值报错
const applyBad = await inv(main, "setting_set", { key: "hotkey", value: "NotAKey" }).then(async () => {
  return inv(main, "hotkey_apply").then(() => "ok").catch((e) => String(e));
});
ok("非法热键报错（前端回滚路径的前提）", String(applyBad).includes("无法解析") || String(applyBad).includes("失败"), String(applyBad).slice(0, 60));
await inv(main, "setting_set", { key: "hotkey", value: "Alt+Q" });
await inv(main, "hotkey_apply");

// 4. 事件日志导出：路径存在且 JSON 可解析
const path = await inv(main, "export_events");
const exists = path && existsSync(path);
let parsed = null;
try { parsed = exists && JSON.parse(readFileSync(path, "utf-8")); } catch { /* ignore */ }
ok("事件日志导出（文件存在+JSON 可解析）", !!(exists && Array.isArray(parsed)), String(path));

// 5. 设置生效链路抽查：slice_minutes 改 30 → 当前环不动（规格：只影响下一个环）+ 设置已落库
await inv(main, "setting_set", { key: "slice_minutes", value: "30" });
await sleep(1200);
const ring = await main.textContent("[data-testid=time-ring] .ring-label").catch(() => null);
const stored = (await inv(main, "q_settings")).find(([k]) => k === "slice_minutes")?.[1];
ok(
  "slice_minutes 落库且当前环不动（规格如此）",
  stored === "30" && (ring === "45" || ring === "44"),
  `stored=${stored} ring=${ring}`,
);
await inv(main, "setting_set", { key: "slice_minutes", value: "45" });

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n== M4 real ${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
