// 真实 exe CDP 实证：稿库拖入中列（原生 OLE 拖放路径），带事件计数与落库验证
const list = await (await fetch('http://127.0.0.1:9223/json')).json();
const main = list.find((p) => p.url === 'http://tauri.localhost/');
const ws = new WebSocket(main.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result && r.result.exceptionDetails) return 'EXC';
  return r.result && r.result.result ? r.result.result.value : undefined;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await new Promise((r) => ws.onopen = r);
const TITLE = 'CDP拖放验证稿';

await evalJs(`window.__c = {}; for (const t of ['dragstart','dragenter','dragover','dragleave','drop','dragend']) document.addEventListener(t, (e) => { window.__c[t] = (window.__c[t]||0)+1; }, true); 1`);
await evalJs(`window.__p = []; document.addEventListener('dragover', (e) => { window.__p.push({ x: Math.round(e.clientX), y: Math.round(e.clientY), tgt: (e.target.className?.slice?.(0,24) ?? e.target.nodeName), inCol: !!(e.target.closest && e.target.closest('[data-testid=board-page]')) }); }, true); 1`);
// 自愈：确保在进程页 tab 且稿库展开
await evalJs(`(()=>{ const t = document.querySelector('[data-testid=tab-board]'); if (t && !document.querySelector('.track-page.current [data-testid=board-page]')) t.click(); })(); 1`);
await sleep(600);
await evalJs(`(()=>{ const rail = document.querySelector('[data-testid=lib-rail]'); const open = document.querySelector('[data-testid=lib-panel].open'); if (rail && !open) rail.click(); })(); 1`);
await sleep(700);
const found = await evalJs(`(()=>{
  const el = [...document.querySelectorAll('[data-testid=plan-row]')].find(r => r.textContent.includes(${JSON.stringify(TITLE)}));
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const rows = document.querySelectorAll('[data-testid=suspended-row]');
  const row2 = rows[1].getBoundingClientRect();
  return { sx: r.x + r.width/2, sy: r.y + r.height/2, tx: row2.x + row2.width/2, ty: row2.y + row2.height/2, n: rows.length };
})()`);
console.log('geometry:', JSON.stringify(found));
if (!found) { console.log('FAIL: plan row not found'); process.exit(1); }

const mouse = (type, x, y, buttons = 1) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
await mouse('mousePressed', found.sx, found.sy);
await sleep(150);
// 先小步触发 dragstart，再多步到目标
await mouse('mouseMoved', found.sx + 6, found.sy + 2);
await sleep(120);
for (let i = 1; i <= 12; i++) {
  await mouse('mouseMoved', found.sx + (found.tx - found.sx) * i / 12, found.sy + (found.ty - found.sy) * i / 12);
  await sleep(90);
}
// 到位后抖动强迫终点 dragover（OLE 拖拽的 dragover 有合并/节流）
for (let j = 0; j < 6; j++) {
  await mouse('mouseMoved', found.tx + (j % 2 ? 2 : -2), found.ty);
  await sleep(160);
}
await sleep(400);
console.log('mid counts:', await evalJs('JSON.stringify(window.__c)'));
console.log('mid dragovers:', await evalJs('JSON.stringify(window.__p.slice(-6))'));
console.log('mid-drag ghost:', await evalJs(`!!document.querySelector('[data-testid=drop-ghost]')`));
await mouse('mouseReleased', found.tx, found.ty, 0);
await sleep(1200);
console.log('post counts:', await evalJs('JSON.stringify(window.__c)'));
const verify = await evalJs(`(async()=>{
  const iv = window.__TAURI_INTERNALS__.invoke;
  const b = await iv('q_board', { day: new Date().toISOString().slice(0,10) });
  const plans = await iv('q_plans');
  const hit = b.suspended.find(r => r.process.title === ${JSON.stringify(TITLE)});
  return { inQueue: !!hit, queueLen: b.suspended.length, planGone: !plans.some(p => p.title === ${JSON.stringify(TITLE)}), domRows: document.querySelectorAll('[data-testid=suspended-row]').length };
})()`);
console.log('verify:', JSON.stringify(verify));
console.log(verify.inQueue && verify.planGone ? 'REAL-EXE DRAG PROOF: PASS' : 'REAL-EXE DRAG PROOF: FAIL');
ws.close(); process.exit(0);
