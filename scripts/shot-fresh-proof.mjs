// 纯净首启实证截图：全新空库 → 空版面（稿库提示）/ 统计空态 / 设置页
import { writeFileSync } from "node:fs";

const list = await (await fetch("http://127.0.0.1:9223/json")).json();
const main = list.find((p) => p.url === "http://tauri.localhost/");
if (!main) { console.log("no main target"); process.exit(1); }
const ws = new WebSocket(main.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (file) => {
  const r = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`docs/screenshots/release/${file}.png`, Buffer.from(r.result.data, "base64"));
  console.log("[fresh-shot]", file);
};
await new Promise((r) => (ws.onopen = r));

// 1. 空版面（含稿库提示）
await sleep(1500);
console.log("empty-state:", await evalJs(`!!document.querySelector('[data-testid=empty-state]')`));
console.log("lib-hint:", await evalJs(`!!document.querySelector('[data-testid=lib-hint]')`));
await shot("fresh-board");

// 2. 统计页空态
await evalJs(`document.querySelector('[data-testid=tab-stats]').click(); 1`);
await sleep(1000);
await shot("fresh-stats");

// 3. 设置页
await evalJs(`document.querySelector('[data-testid=tab-settings]').click(); 1`);
await sleep(900);
await shot("fresh-settings");

// 校验空库确实没有进程/计划
const counts = await evalJs(`(async()=>{
  const iv = window.__TAURI_INTERNALS__.invoke;
  const b = await iv('q_board', { day: new Date().toISOString().slice(0,10) });
  const plans = await iv('q_plans');
  return JSON.stringify({ running: !!b.running, suspended: b.suspended.length, completed: b.completed.length, plans: plans.length });
})()`);
console.log("fresh db counts:", counts);
ws.close(); process.exit(0);
