// 数据导入导出验收（真实 exe + 临时库，CDP 驱动可测层命令）：
// 导出 → 改库 → 导入回滚一致 → 非法文件拒收不污染 → 备份文件存在
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const EXE = "src-tauri/target/release/fermata.exe";
const WORK = "F:\\tmp\\verify-port";
const DB = path.join(WORK, "port-test.db");
const SNAP = path.join(WORK, "snap.fermata.json");
const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}${extra ? " — " + extra : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

const exe = spawn(path.resolve(EXE), [], {
  env: { ...process.env, FERMATA_DB_PATH: DB, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9224" },
  stdio: "ignore",
});
process.on("exit", () => { try { exe.kill(); } catch {} });

// 等 CDP 起来
let targets = null;
for (let i = 0; i < 40; i++) {
  try {
    targets = await (await fetch("http://127.0.0.1:9224/json")).json();
    if (targets.some((p) => p.url === "http://tauri.localhost/")) break;
  } catch {}
  await sleep(500);
}
const main = targets.find((p) => p.url === "http://tauri.localhost/");
if (!main) { console.log("FATAL: 主窗 CDP 没起来"); process.exit(1); }
const ws = new WebSocket(main.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ivk = async (cmd, args = {}) => {
  const r = await send("Runtime.evaluate", {
    expression: `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then(v=>({ok:v})).catch(e=>({err:String(e)}))`,
    awaitPromise: true, returnByValue: true,
  });
  const v = r.result?.result?.value;
  return v;
};
await new Promise((r) => ws.onopen = r);
// 等页面加载完（__TAURI_INTERNALS__ 就绪）
for (let i = 0; i < 30; i++) {
  const ready = await send("Runtime.evaluate", { expression: "!!window.__TAURI_INTERNALS__", returnByValue: true });
  if (ready.result?.result?.value) break;
  await sleep(500);
  if (i === 29) { console.log("FATAL: __TAURI_INTERNALS__ 不就绪"); process.exit(1); }
}

// 1. 造数据：2 进程 + 切换 + 1 计划
let r = await ivk("process_create", { title: "快照甲" });
const pidA = r.ok;
r = await ivk("process_create", { title: "快照乙" });
const pidB = r.ok;
await ivk("process_switch", { pid: pidA });
await sleep(300);
await ivk("process_switch", { pid: pidB, breakpoint: "甲停在半途" });
await ivk("plan_create", { title: "快照计划", estMinutes: 45 });
const day = new Date().toISOString().slice(0, 10);
const board0 = (await ivk("q_board", { day })).ok;
const ev0 = (await ivk("q_events", {})).ok.length;

// 2. 导出
r = await ivk("export_snapshot_to", { path: SNAP });
ok("导出快照到路径", r.ok === SNAP, JSON.stringify(r).slice(0, 80));
const snap = JSON.parse(fs.readFileSync(SNAP, "utf8"));
ok(
  "快照结构：meta + 全表（含事件）",
  snap.meta?.format_version === 1 && Array.isArray(snap.processes) && Array.isArray(snap.events) && snap.events.length === ev0,
  `events=${snap.events?.length}`,
);

// 3. 改库：完成一个进程 + 删计划
await ivk("process_complete", { pid: pidB });
const plans1 = (await ivk("q_plans")).ok;
await ivk("plan_delete", { id: plans1[0].id });
const ev1 = (await ivk("q_events", {})).ok.length;
ok("改库生效（事件更多）", ev1 > ev0, `${ev0}→${ev1}`);

// 4. check 层：只读不碰库
r = await ivk("import_snapshot_check", { path: SNAP });
ok("check 返回摘要且不碰库", r.ok?.processes === 2 && (await ivk("q_events", {})).ok.length === ev1, JSON.stringify(r.ok));

// 5. 导入回滚
r = await ivk("import_snapshot_from", { path: SNAP });
if (!r?.ok) console.log("  [debug] import_snapshot_from raw:", JSON.stringify(r));
ok("导入回执（备份路径+N进程/M事件）", !!r.ok?.backup && r.ok.processes === 2, JSON.stringify(r.ok ?? r).slice(0, 120));
ok("备份文件存在", !!r.ok?.backup && fs.existsSync(r.ok.backup), r.ok?.backup);
const board2 = (await ivk("q_board", { day })).ok;
const titles = [board2.running?.process.title, ...board2.suspended.map((x) => x.process.title)].filter(Boolean);
ok("导入后进程行级一致", titles.includes("快照甲") && titles.includes("快照乙"), titles.join("/"));
ok("导入后事件计数回滚", (await ivk("q_events", {})).ok.length === ev0, `${ev1}→${(await ivk("q_events", {})).ok.length}`);
const plans2 = (await ivk("q_plans")).ok;
ok("导入后计划回来了", plans2.some((p) => p.title === "快照计划" && p.est_minutes === 45), JSON.stringify(plans2));

// 6. 非法文件：拒收且不污染库
const BAD = path.join(WORK, "bad.fermata.json");
const evPreBad = (await ivk("q_events", {})).ok.length;
fs.writeFileSync(BAD, JSON.stringify({ meta: { format_version: 99 }, processes: [] }));
r = await ivk("import_snapshot_from", { path: BAD });
ok("非法文件被拒", !!r.err, String(r.err).slice(0, 60));
const evAfterBad = (await ivk("q_events", {})).ok.length;
ok("拒收后库未动", evAfterBad === evPreBad, `events=${evPreBad}→${evAfterBad}`);
fs.writeFileSync(BAD, "这不是 JSON");
r = await ivk("import_snapshot_check", { path: BAD });
ok("非 JSON 被拒", !!r.err, String(r.err).slice(0, 60));

ws.close();
exe.kill();
const failed = results.filter((x) => !x.pass);
console.log(`\n== 数据导入导出 ${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
