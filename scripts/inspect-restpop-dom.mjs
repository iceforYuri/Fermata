const res = await fetch('http://127.0.0.1:9223/json');
const list = await res.json();
const rp = list.find(p => p.url.includes('window=restpop'));
if (!rp) { console.log('no restpop target'); process.exit(1); }
const ws = new WebSocket(rp.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params) => new Promise((resolve) => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
await new Promise(r => ws.onopen = r);
const r = await send('Runtime.evaluate', { expression: `JSON.stringify({
  innerW: window.innerWidth, innerH: window.innerHeight,
  screenX: window.screenX, screenY: window.screenY,
  dpr: window.devicePixelRatio,
  vis: document.visibilityState,
  hasCard: !!document.querySelector('.restpop'),
  bodyBg: getComputedStyle(document.body).backgroundColor,
  cardBg: document.querySelector('.restpop') ? getComputedStyle(document.querySelector('.restpop')).backgroundColor : null,
  cardRect: document.querySelector('.restpop') ? document.querySelector('.restpop').getBoundingClientRect().toJSON() : null,
  theme: document.documentElement.dataset.theme || document.body.dataset.theme || null,
})`, returnByValue: true });
console.log(r.result && r.result.result ? r.result.result.value : JSON.stringify(r.result));
ws.close(); process.exit(0);
