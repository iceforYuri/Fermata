// 诊断 restpop 位置：invoke show_restpop，然后用 CDP 读窗口位置（通过 sys command）
const target = process.argv[2] || 'main';
const res = await fetch('http://127.0.0.1:9223/json');
const list = await res.json();
const page = list.find(p => p.url === 'http://tauri.localhost/' || (!target || p.url.includes('window=' + target)));
const main = list.find(p => p.url === 'http://tauri.localhost/');
const ws = new WebSocket(main.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
function send(method, params) {
  return new Promise((resolve) => {
    const mid = ++id;
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result && r.result.result ? r.result.result.value : r.result;
}
await new Promise(r => ws.onopen = r);

// 1. invoke show_restpop（Tauri v2 注入 __TAURI_INTERNALS__）
const inv = await evalJs(`window.__TAURI_INTERNALS__.invoke('show_restpop').then(()=>'ok').catch(e=>'err:'+e)`);
console.log('invoke show_restpop:', inv);
await new Promise(r => setTimeout(r, 600));

// 2. 读回位置：__TAURI_INTERNALS__.invoke 走 plugin:window| 通道
const pos2 = await evalJs(`(async()=>{
  try {
    const iv = window.__TAURI_INTERNALS__.invoke;
    const p = await iv('plugin:window|outer_position', { label: 'restpop' });
    const s = await iv('plugin:window|outer_size', { label: 'restpop' });
    const v = await iv('plugin:window|is_visible', { label: 'restpop' });
    return JSON.stringify({x:p.x, y:p.y, w:s.width, h:s.height, visible:v});
  } catch(e) { return 'err:'+e; }
})()`);
console.log('restpop outerPosition:', pos2);

// 3. 主显示器信息
const mon = await evalJs(`(async()=>{
  try {
    const pm = await window.__TAURI_INTERNALS__.invoke('plugin:window|primary_monitor');
    return JSON.stringify(pm);
  } catch(e) { return 'err:'+e; }
})()`);
console.log('primaryMonitor:', mon);

ws.close();
process.exit(0);
