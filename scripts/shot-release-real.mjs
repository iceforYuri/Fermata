// release 真机实拍：真实库进程页/统计页 + 切换浮层 + 休止符（CDP Page.captureScreenshot）
// 前置：fermata.exe 以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9223 运行
import { writeFileSync } from "node:fs";

const list = await (await fetch("http://127.0.0.1:9223/json")).json();
const targets = new Map();
for (const p of list) {
  if (p.url === "http://tauri.localhost/") targets.set("main", p);
  else if (p.url.includes("window=switcher")) targets.set("switcher", p);
  else if (p.url.includes("window=restpop")) targets.set("restpop", p);
}
const conns = new Map();
async function conn(name) {
  if (conns.has(name)) return conns.get(name);
  const ws = new WebSocket(targets.get(name).webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await new Promise((r) => (ws.onopen = r));
  const c = { send, ws };
  conns.set(name, c);
  return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(name, file) {
  const c = await conn(name);
  const r = await c.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`docs/screenshots/release/${file}.png`, Buffer.from(r.result.data, "base64"));
  console.log("[real-shot]", file);
}
async function evalMain(expr) {
  const c = await conn("main");
  const r = await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result && r.result.result ? r.result.result.value : undefined;
}
const invoke = (cmd) => evalMain(`window.__TAURI_INTERNALS__.invoke('${cmd}').then(()=>1).catch(e=>'err:'+e)`);

// 1. 真实库进程页
await evalMain("new Promise(r => setTimeout(r, 1200))");
await shot("main", "real-board");

// 2. 真实库统计页（月视角）
await evalMain(`document.querySelector('[data-testid=tab-stats]').click(); 1`);
await sleep(900);
await shot("main", "real-stats-month");

// 3. 设置页
await evalMain(`document.querySelector('[data-testid=tab-settings]').click(); 1`);
await sleep(900);
await shot("main", "real-settings");

// 回进程页
await evalMain(`document.querySelector('[data-testid=tab-board]').click(); 1`);
await sleep(600);

// 4. 切换浮层（先抖一下鼠标位置无所谓——switcher 要焦点，直接 invoke show）
console.log("show_switcher:", await invoke("show_switcher"));
await sleep(700);
await shot("switcher", "real-overlay-switcher");
console.log("hide_switcher:", await invoke("hide_switcher"));
await sleep(400);

// 5. 休止符（右下角，不抢焦点）
console.log("show_restpop:", await invoke("show_restpop"));
await sleep(700);
await shot("restpop", "real-overlay-restpop");
console.log("hide_restpop:", await invoke("hide_restpop"));

for (const c of conns.values()) c.ws.close();
process.exit(0);
