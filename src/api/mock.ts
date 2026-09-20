/**
 * 浏览器内 mock 内核：非 Tauri 环境（截图/无头验证）时顶替数据层。
 * 行为对齐 M0 状态机；时间戳相对加载时刻，保证截图确定性。
 * URL 参数：?fixture=rich（默认）/ empty / rest
 */
import type {
  BoardProcess,
  CellMark,
  DataApi,
  FermataEvent,
  PaletteEntry,
  Plan,
  Process,
  ProcessState,
  Step,
} from "./types";
import { PALETTE_DARK, PALETTE_LIGHT } from "./palette";

const DAY_MS = 86_400_000;

interface Seg {
  pid: number;
  start: number;
  end: number | null;
}

interface MockState {
  nextId: number;
  processes: Process[];
  steps: Step[];
  plans: Plan[];
  segs: Seg[];
  events: FermataEvent[];
  slices: Record<number, { complete: number; aborted: number }>;
  suspendedSince: Record<number, number | null>; // 当前挂起开口起点（含等AI前区间已在 agingBase 折现）
  agingBase: Record<number, number>; // 已闭合挂起区间累计 ms
  resting: boolean;
  restSince: number | null;
  restSource: string | null;
  restChoice: string | null;
  settings: Record<string, string>;
}

function dayOfTs(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayRangeMs(day: string): [number, number] {
  const [y, m, d] = day.split("-").map(Number);
  const s = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  return [s, s + 86_400_000];
}

const fixture =
  new URLSearchParams(location.search).get("fixture") ??
  (location.hash.includes("rest") ? "rest" : "rich");

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function baseState(): MockState {
  return {
    nextId: 1,
    processes: [],
    steps: [],
    plans: [],
    segs: [],
    events: [],
    slices: {},
    suspendedSince: {},
    agingBase: {},
    resting: false,
    restSince: null,
    restSource: null,
    restChoice: null,
    settings: {
      always_on_top: "0",
      continuous_limit_minutes: "90",
      hotkey: "Alt+Q",
      idle_threshold_minutes: "5",
      rest_mode: "soft",
      slice_minutes: "45",
      theme: "light",
    },
  };
}

function buildRich(): MockState {
  const s = baseState();
  const now = Date.now();
  const day = todayStr();
  const mk = (
    title: string,
    state: ProcessState,
    opts: Partial<Process> = {},
  ): Process => {
    const p: Process = {
      id: s.nextId++,
      title,
      state,
      prev_state: opts.prev_state ?? null,
      color_tag: opts.color_tag ?? null,
      notes: null,
      created_at: opts.created_at ?? now,
      activated_count: opts.activated_count ?? 1,
      completed_at: opts.completed_at ?? null,
      queue_position: opts.queue_position ?? null,
      board_date: day,
    };
    s.processes.push(p);
    return p;
  };
  const seg = (pid: number, startAgo: number, endAgo: number | null) =>
    s.segs.push({ pid, start: now - startAgo, end: endAgo === null ? null : now - endAgo });
  const H = 3_600_000;
  const M = 60_000;

  // 已完 ×2
  const p1 = mk("晨间规划：排今天的版面", "completed", {
    created_at: now - 8 * H,
    completed_at: now - 7.6 * H,
  });
  seg(p1.id, 8 * H, 7.6 * H);
  const p2 = mk("审 PR #142：断点续传", "completed", {
    color_tag: 2,
    created_at: now - 7.5 * H,
    completed_at: now - 6.7 * H,
  });
  seg(p2.id, 7.4 * H, 6.7 * H);
  ["通读 diff", "本地跑一遍", "写评审意见"].forEach((t, i) =>
    s.steps.push({
      id: s.nextId++,
      process_id: p2.id,
      title: t,
      done: true,
      done_at: now - 7 * H,
      position: i + 1,
      kind: "step",
    }),
  );

  // 运行中
  const run = mk("改 Fermata 数据内核", "running", {
    color_tag: 3,
    created_at: now - 6.6 * H,
    queue_position: null,
  });
  seg(run.id, 6.55 * H, 5.8 * H);
  seg(run.id, 5.65 * H, 4.85 * H);
  seg(run.id, 4.55 * H, 3.6 * H);
  seg(run.id, 3.4 * H, 2.55 * H);
  seg(run.id, 26 * M, null); // 开口：时间环锚点
  s.slices[run.id] = { complete: 4, aborted: 1 };
  [
    ["定 schema v1", true],
    ["状态机与命令层", true],
    ["集成测试三件套", false],
    ["一周种子数据", false],
  ].forEach(([t, done], i) =>
    s.steps.push({
      id: s.nextId++,
      process_id: run.id,
      title: t as string,
      done: done as boolean,
      done_at: (done as boolean) ? now - 4 * H : null,
      position: i + 1,
      kind: "step",
    }),
  );

  // 挂起 ×4（老化各不相同，含等AI）
  const mails = mk("回三封邮件", "suspended", {
    color_tag: 5,
    created_at: now - 8 * H,
    queue_position: 1,
  });
  s.steps.push({ id: s.nextId++, process_id: mails.id, title: "已回两封，剩财务那封", done: false, done_at: null, position: 1, kind: "note" });
  seg(mails.id, 4.55 * H, 4.2 * H);
  s.suspendedSince[mails.id] = now - 4.2 * H;
  const weekly = mk("写周报", "suspended", {
    color_tag: 0,
    created_at: now - 2.9 * H,
    queue_position: 2,
  });
  s.suspendedSince[weekly.id] = now - 2.9 * H;
  const book = mk("读《形式的起源》第 4 章", "suspended", {
    color_tag: 6,
    created_at: now - 1.3 * H,
    queue_position: 3,
  });
  s.suspendedSince[book.id] = now - 1.3 * H;
  const waiting = mk("等 AI 跑财报数据", "waiting_ai", {
    color_tag: 1,
    prev_state: "suspended",
    created_at: now - 1.8 * H,
    queue_position: 4,
  });
  s.steps.push({ id: s.nextId++, process_id: waiting.id, title: "Q3 口径已发，等批跑完", done: false, done_at: null, position: 1, kind: "note" });
  s.agingBase[waiting.id] = 5 * M; // 等AI 前只有 5 分钟老化
  s.suspendedSince[waiting.id] = null;

  // 稿库
  const plan = (title: string, est: number, date: string, done = false) =>
    s.plans.push({
      id: s.nextId++,
      title,
      est_minutes: est,
      scheduled_date: date,
      state: done ? "completed" : "pool",
      created_at: now - 9 * H,
      completed_at: done ? now - 8 * H : null,
      position: s.plans.length + 1,
    });
  const t = todayStr();
  const tm = new Date(now + DAY_MS);
  const tmStr = `${tm.getFullYear()}-${String(tm.getMonth() + 1).padStart(2, "0")}-${String(tm.getDate()).padStart(2, "0")}`;
  const da = new Date(now + 2 * DAY_MS);
  const daStr = `${da.getFullYear()}-${String(da.getMonth() + 1).padStart(2, "0")}-${String(da.getDate()).padStart(2, "0")}`;
  plan("整理会议纪要模板", 30, t, true); // 已完成（q_plans 不返回）
  plan("准备周五评审材料", 60, t);
  plan("给设计稿写反馈", 25, t);
  plan("订下周差旅", 15, t);
  plan("约一对一谈晋升节奏", 30, tmStr);
  plan("读完 RAG 综述第 3 节", 40, tmStr);
  plan("整理季度 OKR 草稿", 45, daStr);

  // —— 历史演示数据（统计页用）：过去 ~90 天确定性稀疏铺陈 ——
  const HIST: [string, number | null][] = [
    ["写方案章节", 0], ["读论文", 4], ["回邮件", null], ["改 bug 单", 3],
    ["代码评审", 2], ["整理纪要", 1], ["学文档", 5], ["画架构草图", 6],
  ];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed);
  for (let off = 1; off <= 90; off++) {
    if (rnd() % 10 < 4) continue; // ~60% 有记录
    const d = new Date(now - off * DAY_MS);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const n = 1 + (rnd() % 2);
    for (let k = 0; k < n; k++) {
      const [title, color] = HIST[rnd() % HIST.length];
      const p: Process = {
        id: s.nextId++, title, state: "completed", prev_state: null,
        color_tag: color, notes: null,
        created_at: 0, activated_count: 1,
        completed_at: 0, queue_position: null, board_date: ds,
      };
      const startH = 9 + (rnd() % 8);
      const start = new Date(d); start.setHours(startH, rnd() % 60, 0, 0);
      const len = (25 + (rnd() % 120)) * 60_000;
      s.processes.push(p);
      s.segs.push({ pid: p.id, start: start.getTime(), end: start.getTime() + len });
      s.events.push({ id: s.events.length + 1, ts: start.getTime(), kind: "switch_in", process_id: p.id, payload: "{}" });
    }
  }
  return s;
}

function buildEmpty(): MockState {
  const s = baseState();
  const now = Date.now();
  const t = todayStr();
  s.plans.push({
    id: s.nextId++,
    title: "把第一件事拖进版面",
    est_minutes: 25,
    scheduled_date: t,
    state: "pool",
    created_at: now,
    completed_at: null,
    position: 1,
  });
  s.plans.push({
    id: s.nextId++,
    title: "或者直接写下此刻最惦记的",
    est_minutes: null,
    scheduled_date: t,
    state: "pool",
    created_at: now,
    completed_at: null,
    position: 2,
  });
  return s;
}

const state: MockState =
  fixture === "empty" ? buildEmpty() : buildRich();
if (fixture === "rest") {
  state.resting = true;
  state.restSince = Date.now() - 12 * 60_000;
  state.restSource = "时间片走满 · 第 47 分钟";
  // 休息时计时停：合上运行进程的开口段
  const run = state.processes.find((p) => p.state === "running");
  if (run) {
    const open = state.segs.find((g) => g.pid === run.id && g.end === null);
    if (open) open.end = state.restSince;
  }
}

// ---------- 内核行为 ----------

function proc(pid: number): Process {
  const p = state.processes.find((x) => x.id === pid);
  if (!p) throw new Error(`进程 ${pid} 不存在`);
  return p;
}

function ev(kind: string, pid: number | null, payload: unknown = {}) {
  state.events.push({
    id: state.events.length + 1,
    ts: Date.now(),
    kind,
    process_id: pid,
    payload: JSON.stringify(payload),
  });
}

function closeSeg(pid: number) {
  const g = state.segs.find((x) => x.pid === pid && x.end === null);
  if (g) g.end = Date.now();
}

function openSeg(pid: number) {
  if (!state.segs.some((x) => x.pid === pid && x.end === null)) {
    state.segs.push({ pid, start: Date.now(), end: null });
  }
}

function queueTail(pid: number) {
  const day = todayStr();
  const max = Math.max(
    0,
    ...state.processes
      .filter((p) => p.board_date === day && p.queue_position !== null)
      .map((p) => p.queue_position!),
  );
  proc(pid).queue_position = max + 1;
}

/** MRU：切出落队首（其余后移） */
function queueHead(pid: number) {
  for (const p of state.processes) {
    if (p.queue_position !== null) p.queue_position += 1;
  }
  proc(pid).queue_position = 1;
}

function suspend(pid: number, breakpoint?: string) {
  const p = proc(pid);
  closeSeg(pid);
  if (breakpoint !== undefined && breakpoint !== "") {
    for (const st of state.steps.filter((x) => x.process_id === pid)) st.position += 1;
    state.steps.push({ id: state.nextId++, process_id: pid, title: breakpoint, done: false, done_at: null, position: 1, kind: "note" });
  }
  p.state = "suspended";
  p.prev_state = null;
  queueHead(pid);
  ev("switch_out", pid, { breakpoint, to: null });
  state.suspendedSince[pid] = Date.now();
}

function dayTotal(pid: number): number {
  const now = Date.now();
  return state.segs
    .filter((g) => g.pid === pid)
    .reduce((acc, g) => acc + Math.max(0, (g.end ?? now) - g.start), 0);
}

function aging(p: Process): number | null {
  if (p.state !== "suspended" && p.state !== "waiting_ai") return null;
  const base = state.agingBase[p.id] ?? 0;
  if (p.state === "waiting_ai") return base; // 等AI 不计老化
  const since = state.suspendedSince[p.id];
  return base + (since ? Date.now() - since : 0);
}

function ringElapsed(pid: number): number {
  // 锚点 = 本会话最后一个 switch_in / slice_complete
  const anchors = state.events.filter(
    (e) => e.process_id === pid && (e.kind === "switch_in" || e.kind === "slice_complete"),
  );
  if (!anchors.length) return 0;
  const anchor = anchors[anchors.length - 1].ts;
  const now = Date.now();
  return state.segs
    .filter((g) => g.pid === pid)
    .reduce((acc, g) => {
      const e = g.end ?? now;
      if (e <= anchor) return acc;
      return acc + Math.max(0, Math.min(e, now) - Math.max(g.start, anchor));
    }, 0);
}

function stackTop(pid: number): { title: string; kind: "step" | "note" } | null {
  const t = state.steps
    .filter((x) => x.process_id === pid)
    .sort((a, b) => a.position - b.position)
    .find((x) => x.kind === "note" || !x.done);
  return t ? { title: t.title, kind: t.kind } : null;
}

function toBoardProcess(p: Process): BoardProcess {
  const open = state.segs.find((g) => g.pid === p.id && g.end === null);
  return {
    ring_elapsed_ms: ringElapsed(p.id),
    process: { ...p },
    steps: state.steps
      .filter((x) => x.process_id === p.id)
      .sort((a, b) => a.position - b.position)
      .map((x) => ({ ...x })),
    day_total_ms: dayTotal(p.id),
    aging_ms: aging(p),
    active_segment_started_at: open ? open.start : null,
    timer_open: p.state === "running" && !!open,
    stack_top: stackTop(p.id),
  };
}

export const mockData: DataApi = {
  async processCreate(title, colorTag, boardDate) {
    const day = boardDate ?? todayStr();
    const p: Process = {
      id: state.nextId++,
      title,
      state: "suspended",
      prev_state: null,
      color_tag: colorTag ?? null,
      notes: null,
      created_at: Date.now(),
      activated_count: 0,
      completed_at: null,
      queue_position: null,
      board_date: day,
    };
    state.processes.push(p);
    queueTail(p.id);
    state.suspendedSince[p.id] = Date.now();
    ev("process_create", p.id, { title });
    return p.id;
  },

  async processSwitch(pid, breakpoint) {
    const target = proc(pid);
    if (target.state === "completed") throw new Error("已完成，需先重开");
    if (target.state === "running") throw new Error("已在运行");
    const cur = state.processes.find((p) => p.state === "running");
    if (cur) suspend(cur.id, breakpoint);
    target.state = "running";
    target.prev_state = null;
    target.queue_position = null;
    target.activated_count += 1;
    ev("switch_in", pid, { from: cur?.id ?? null });
    openSeg(pid);
    state.suspendedSince[pid] = null;
  },

  async processComplete(pid) {
    const p = proc(pid);
    if (p.state === "completed") throw new Error("已是完成态");
    closeSeg(pid);
    p.state = "completed";
    p.prev_state = null;
    p.completed_at = Date.now();
    p.queue_position = null;
    ev("process_complete", pid);
  },

  async processReopen(pid) {
    const p = proc(pid);
    if (p.state !== "completed") throw new Error("不在完成态");
    p.state = "suspended";
    p.completed_at = null;
    queueTail(pid);
    state.suspendedSince[pid] = Date.now();
    ev("process_reopen", pid);
  },

  async processPause(pid) {
    const p = proc(pid);
    if (p.state !== "running") throw new Error("不在运行");
    if (!state.segs.some((g) => g.pid === pid && g.end === null)) throw new Error("计时已停");
    closeSeg(pid);
    ev("pause", pid);
  },

  async processResume(pid) {
    const p = proc(pid);
    if (p.state !== "running") throw new Error("不在运行");
    if (state.segs.some((g) => g.pid === pid && g.end === null)) throw new Error("计时本就在走");
    ev("resume", pid);
    openSeg(pid);
  },

  async breakpointSet(pid, text) {
    for (const st of state.steps.filter((x) => x.process_id === pid)) st.position += 1;
    state.steps.push({ id: state.nextId++, process_id: pid, title: text, done: false, done_at: null, position: 1, kind: "note" });
    ev("entry_add", pid, { kind: "note", title: text });
  },

  async entryDelete(stepId) {
    const i = state.steps.findIndex((x) => x.id === stepId);
    if (i >= 0) {
      const pid = state.steps[i].process_id;
      state.steps.splice(i, 1);
      ev("entry_delete", pid, { step_id: stepId });
    }
  },

  async colorSet(pid, slot) {
    proc(pid).color_tag = slot;
    ev("color_set", pid, { slot });
  },

  async waitingAiSet(pid, on) {
    const p = proc(pid);
    if (on) {
      if (p.state === "waiting_ai") throw new Error("已处于等AI");
      if (p.state === "completed") throw new Error("已完成");
      if (p.state === "running") closeSeg(pid);
      if (p.state === "suspended" && state.suspendedSince[pid]) {
        state.agingBase[pid] =
          (state.agingBase[pid] ?? 0) + (Date.now() - state.suspendedSince[pid]!);
        state.suspendedSince[pid] = null;
      }
      p.prev_state = p.state;
      p.state = "waiting_ai" as ProcessState;
      ev("waiting_ai_set", pid, { on: true, prev_state: p.prev_state });
    } else {
      if (p.state !== "waiting_ai") throw new Error("不在等AI");
      const back = (p.prev_state ?? "suspended") as ProcessState;
      p.prev_state = null;
      p.state = back;
      if (back === "running") openSeg(pid);
      else state.suspendedSince[pid] = Date.now();
      ev("waiting_ai_set", pid, { on: false, restored: back });
    }
  },

  async stepAdd(pid, title) {
    proc(pid);
    for (const st of state.steps.filter((x) => x.process_id === pid)) st.position += 1; // 置顶
    const id = state.nextId++;
    state.steps.push({ id, process_id: pid, title, done: false, done_at: null, position: 1, kind: "step" });
    ev("step_add", pid, { step_id: id, title });
    return id;
  },

  async stepCheck(stepId, done) {
    const st = state.steps.find((x) => x.id === stepId);
    if (!st) throw new Error("步骤不存在");
    st.done = done;
    st.done_at = done ? Date.now() : null;
    ev("step_check", st.process_id, { step_id: stepId, done });
  },

  async stepsReorder(pid, orderedStepIds) {
    orderedStepIds.forEach((sid, i) => {
      const st = state.steps.find((x) => x.id === sid && x.process_id === pid);
      if (!st) throw new Error(`步骤 ${sid} 不属于进程 ${pid}`);
      st.position = i + 1;
    });
    ev("steps_reorder", pid, { ordered_step_ids: orderedStepIds });
  },

  async queueReorder(day, orderedPids) {
    orderedPids.forEach((pid, i) => {
      const p = proc(pid);
      if (p.board_date !== day || (p.state !== "suspended" && p.state !== "waiting_ai")) {
        throw new Error(`进程 ${pid} 不在挂起队列`);
      }
      p.queue_position = i + 1;
    });
    ev("queue_reorder", null, { day, ordered_pids: orderedPids });
  },

  async planCreate(title, estMinutes, scheduledDate) {
    const id = state.nextId++;
    state.plans.push({
      id,
      title,
      est_minutes: estMinutes ?? null,
      scheduled_date: scheduledDate ?? null,
      state: "pool",
      created_at: Date.now(),
      completed_at: null,
      position: state.plans.length + 1,
    });
    ev("plan_create", null, { plan_id: id, title });
    return id;
  },

  async planUpdate(id, patch) {
    const pl = state.plans.find((x) => x.id === id && x.state === "pool");
    if (!pl) throw new Error("计划不在稿库");
    if (patch.title !== undefined) pl.title = patch.title;
    if (patch.estMinutes !== undefined) pl.est_minutes = patch.estMinutes;
    if (patch.scheduledDate !== undefined) pl.scheduled_date = patch.scheduledDate;
    ev("plan_update", null, { plan_id: id });
  },

  async planDone(id) {
    const pl = state.plans.find((x) => x.id === id && x.state === "pool");
    if (!pl) throw new Error("计划不在稿库");
    // 记稠密名次（1-based），回退插回原位用
    pl.prev_position =
      state.plans.filter((x) => x.state === "pool" && (x.position ?? 0) < (pl.position ?? 0)).length + 1;
    pl.state = "completed";
    pl.completed_at = Date.now();
    ev("plan_done", null, { plan_id: id });
  },

  async planDelete(id) {
    const pl = state.plans.find((x) => x.id === id && x.state === "pool");
    if (!pl) throw new Error("计划不在稿库");
    pl.state = "deleted";
    ev("plan_delete", null, { plan_id: id });
  },

  async planReopen(id) {
    const pl = state.plans.find((x) => x.id === id && x.state === "completed");
    if (!pl) throw new Error("计划不在完成态");
    // 插回 min(prev_position, 队列长度) 原位；**不改他人 position**：邻居间取分数位中值
    const pool = state.plans
      .filter((x) => x.state === "pool")
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id - b.id);
    const len = pool.length;
    const idx0 = pl.prev_position != null
      ? Math.max(0, Math.min(pl.prev_position, len) - 1)
      : len;
    const before = idx0 > 0 ? (pool[idx0 - 1].position ?? 0) : null;
    const after = idx0 < pool.length ? (pool[idx0].position ?? 0) : null;
    pl.position =
      before !== null && after !== null ? (before + after) / 2
      : before === null && after !== null ? after - 1
      : before !== null ? before + 1
      : 1;
    pl.state = "pool";
    pl.completed_at = null;
    ev("plan_reopen", null, { plan_id: id });
  },

  async idleStart(pid) {
    if (pid) closeSeg(pid);
    ev("idle_start", pid ?? null);
  },
  async idleEnd(pid) {
    ev("idle_end", pid ?? null);
    if (pid && proc(pid).state === "running") openSeg(pid);
  },
  async restTrigger(pid, source, readingMs) {
    ev("rest_trigger", pid, { source, reading_ms: readingMs });
  },
  async restChoice(pid, choice) {
    state.restChoice = choice;
    ev("rest_choice", pid, { choice });
  },
  async restStart(pid) {
    if (pid) closeSeg(pid);
    state.resting = true;
    state.restSince = Date.now();
    state.restSource = "时间片走满";
    state.restChoice = null;
    ev("rest_start", pid ?? null);
  },
  async restEnd(pid) {
    ev("rest_end", pid ?? null);
    state.resting = false;
    state.restSince = null;
    if (pid && proc(pid).state === "running") openSeg(pid);
  },
  async sliceComplete(pid) {
    (state.slices[pid] ??= { complete: 0, aborted: 0 }).complete += 1;
    ev("slice_complete", pid);
  },
  async sliceOverride(pid, minutes) {
    ev("slice_override", pid, { minutes });
  },
  async sliceAborted(pid, elapsedMs) {
    (state.slices[pid] ??= { complete: 0, aborted: 0 }).aborted += 1;
    ev("slice_aborted", pid, { elapsed_ms: elapsedMs });
  },

  async qBoard(day) {
    const rows = state.processes.filter((p) => p.board_date === day);
    const running = rows.find((p) => p.state === "running") ?? null;
    const suspended = rows
      .filter((p) => p.state === "suspended" || p.state === "waiting_ai")
      .sort((a, b) => (a.queue_position ?? 1e9) - (b.queue_position ?? 1e9));
    const completed = rows
      .filter((p) => p.state === "completed")
      .sort((a, b) => (a.completed_at ?? 0) - (b.completed_at ?? 0));
    return {
      day,
      running: running ? toBoardProcess(running) : null,
      suspended: suspended.map(toBoardProcess),
      completed: completed.map(toBoardProcess),
      completed_total_ms: completed.reduce((a, p) => a + dayTotal(p.id), 0),
    };
  },

  async qProcessDayTotal(pid) {
    return dayTotal(pid);
  },
  async qSuspendedMs(pid) {
    return aging(proc(pid)) ?? 0;
  },
  async qSliceStats(pid) {
    return state.slices[pid] ?? { complete: 0, aborted: 0 };
  },
  async qContinuousWorkMs() {
    return 0;
  },
  async qEvents() {
    return [...state.events];
  },
  async qSettings() {
    return Object.entries(state.settings).map(([k, v]) => [k, v] as [string, string]);
  },
  async qPalette() {
    const entries: PaletteEntry[] = [];
    for (const theme of ["light", "dark"] as const) {
      const src = theme === "light" ? PALETTE_LIGHT : PALETTE_DARK;
      src.forEach((hex, slot) => entries.push({ theme, slot, hex }));
    }
    return entries;
  },
  async qPlans() {
    return state.plans.filter((p) => p.state === "pool").map((p) => ({ ...p }));
  },

  async qSegments(pid) {
    return state.segs
      .filter((g) => g.pid === pid)
      .sort((a, b) => a.start - b.start)
      .map((g, i) => ({
        id: pid * 1000 + i,
        process_id: pid,
        started_at: g.start,
        ended_at: g.end,
        day: todayStr(),
        kind: "focus",
        note: null,
      }));
  },

  async segmentNote() {},

  async settingSet(key, value) {
    state.settings[key] = value;
    ev("setting_set", null, { key, value });
  },

  async idleConfirm(pid, yes) {
    if (yes) {
      // 合并：删空闲后新开的段，重开空闲前闭合的段
      const segs = state.segs.filter((g: Seg) => g.pid === pid);
      const openIdx = segs.map((g: Seg) => g.end === null).lastIndexOf(true);
      const closedIdx = openIdx > 0 ? openIdx - 1 : -1;
      if (openIdx >= 0 && closedIdx >= 0 && segs[closedIdx].end !== null) {
        const openSeg = segs[openIdx];
        state.segs.splice(state.segs.indexOf(openSeg), 1);
        segs[closedIdx].end = null;
      }
    }
    ev("idle_confirm", pid, { yes });
  },

  async qDayStats(day) {
    const pids = new Set(state.segs.filter((g) => dayOfTs(g.start) === day).map((g) => g.pid));
    const slices = [...pids].map((pid) => {
      const p = proc(pid);
      const ms = state.segs
        .filter((g) => g.pid === pid && dayOfTs(g.start) === day)
        .reduce((a, g) => a + (g.end ?? Date.now()) - g.start, 0);
      return { process_id: pid, title: p.title, color_tag: p.color_tag, ms };
    }).sort((a, b) => b.ms - a.ms);
    const total = slices.reduce((a, x) => a + x.ms, 0);
    const longest = Math.max(
      0,
      ...state.segs.filter((g) => dayOfTs(g.start) === day).map((g) => (g.end ?? Date.now()) - g.start),
    );
    const [ds, de] = dayRangeMs(day);
    const switchCount = state.events.filter(
      (e) => e.kind === "switch_in" && e.ts >= ds && e.ts < de,
    ).length;
    return { day, slices, total_ms: total, switch_count: switchCount, longest_segment_ms: longest };
  },

  async qMonthCalendar(year, month) {
    const byDay = new Map<string, Map<number | null, number>>();
    for (const g of state.segs) {
      const d = dayOfTs(g.start);
      const [y, m] = d.split("-").map(Number);
      if (y !== year || m !== month) continue;
      const p = proc(g.pid);
      const ms = (g.end ?? Date.now()) - g.start;
      if (!byDay.has(d)) byDay.set(d, new Map());
      const row = byDay.get(d)!;
      row.set(p.color_tag, (row.get(p.color_tag) ?? 0) + ms);
    }
    return [...byDay.entries()].sort().map(([day, m]) => ({
      day,
      shares: [...m.entries()].map(([color_tag, ms]) => ({ color_tag, ms })),
    }));
  },

  async qYearOverview(year) {
    const byMonth = new Map<number, Map<number | null, number>>();
    const years = new Set<number>();
    for (const g of state.segs) {
      const d = dayOfTs(g.start);
      const [y, m] = d.split("-").map(Number);
      years.add(y);
      if (y !== year) continue;
      const p = proc(g.pid);
      const ms = (g.end ?? Date.now()) - g.start;
      if (!byMonth.has(m)) byMonth.set(m, new Map());
      const row = byMonth.get(m)!;
      row.set(p.color_tag, (row.get(p.color_tag) ?? 0) + ms);
    }
    return {
      year,
      months: [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([month, m]) => ({
        month,
        shares: [...m.entries()].map(([color_tag, ms]) => ({ color_tag, ms })),
      })),
      available_years: [...years].sort(),
    };
  },

  async qDayView(day) {
    const rows = state.processes.filter((p) => p.board_date === day);
    const toDvp = (p: Process) => ({
      process_id: p.id,
      title: p.title,
      color_tag: p.color_tag,
      ms: state.segs
        .filter((g) => g.pid === p.id && dayOfTs(g.start) === day)
        .reduce((a, g) => a + (g.end ?? Date.now()) - g.start, 0),
      steps_done: state.steps.filter((x) => x.process_id === p.id && x.done).length,
      steps_total: state.steps.filter((x) => x.process_id === p.id).length,
      breakpoint: stackTop(p.id)?.title ?? null,
    });
    const plans = state.plans.filter((p) => p.scheduled_date === day && p.state !== "deleted");
    return {
      day,
      done: rows.filter((p) => p.state === "completed").map(toDvp),
      ongoing: rows.filter((p) => p.state !== "completed").map(toDvp),
      plans: plans.map((p) => ({ ...p })),
      not_done: plans.filter((p) => p.state === "pool").map((p) => ({ ...p })),
      suspended_costs: rows
        .filter((p) => p.state === "suspended" || p.state === "waiting_ai")
        .map((p) => ({
          process_id: p.id,
          title: p.title,
          waited_ms: aging(p) ?? 0,
          retrieved: false,
        })),
    };
  },

  async qDayGrid(day) {
    // v1.4 口径（与 Rust q_day_grid 一致）：share=占用率（分母=格的 10 分钟）；
    // <20% 不返回；≥20% 取前二（3 个以上只留前两名）；occ_start/occ_end 钳制在格窗内。
    const MIN_SHARE = 0.2; // 镜像 token --grid-min-share（数据层侧写死，渲染阈值仍走 token）
    const [d0] = dayRangeMs(day);
    const ds = d0 + 6 * 3_600_000; // 时窗起点 06:00
    const CELL = 600_000;
    const cells: { cell: number; marks: CellMark[] }[] = Array.from({ length: 108 }, (_, i) => ({
      cell: i,
      marks: [],
    }));
    const now = Date.now();
    // cell -> pid -> 累计占用 ms
    const cellMs = new Map<number, Map<number, number>>();
    for (const g of state.segs) {
      if (dayOfTs(g.start) !== day) continue;
      const e = Math.min(g.end ?? now, now);
      // 截断到时窗内
      const gs = Math.max(g.start, ds);
      const ge = Math.min(e, ds + 18 * 3_600_000);
      if (ge <= gs) continue;
      const c0 = Math.min(107, Math.floor((gs - ds) / CELL));
      const c1 = Math.min(107, Math.floor((ge - 1 - ds) / CELL));
      for (let c = c0; c <= c1; c++) {
        const cs = ds + c * CELL;
        const ov = Math.max(0, Math.min(ge, cs + CELL) - Math.max(gs, cs));
        if (ov <= 0) continue;
        if (!cellMs.has(c)) cellMs.set(c, new Map());
        const m = cellMs.get(c)!;
        m.set(g.pid, (m.get(g.pid) ?? 0) + ov);
      }
    }
    for (const [c, m] of cellMs) {
      const cs = ds + c * CELL;
      const ranked = [...m.entries()].sort((a, b) => b[1] - a[1]);
      for (const [pid, ms] of ranked.slice(0, 2)) {
        const share = ms / CELL;
        if (share < MIN_SHARE) break; // 后面的更小，一并不取
        const p = proc(pid);
        // 该进程覆盖此格的段（取重叠最多的一条定起止方向）
        let best: Seg | null = null;
        let bestOv = 0;
        for (const g of state.segs) {
          if (g.pid !== pid || dayOfTs(g.start) !== day) continue;
          const gs = Math.max(g.start, ds, cs);
          const ge = Math.min(g.end ?? now, now, ds + 18 * 3_600_000, cs + CELL);
          const ov = Math.max(0, ge - gs);
          if (ov > bestOv) {
            bestOv = ov;
            best = g;
          }
        }
        // 占用区间：该进程所有段与本格窗交集的并
        let occStart = Infinity;
        let occEnd = -Infinity;
        for (const g of state.segs) {
          if (g.pid !== pid || dayOfTs(g.start) !== day) continue;
          const gs = Math.max(g.start, cs);
          const ge = Math.min(g.end ?? now, now, cs + CELL);
          if (ge > gs) {
            occStart = Math.min(occStart, gs);
            occEnd = Math.max(occEnd, ge);
          }
        }
        if (!best || occEnd <= occStart) continue;
        cells[c].marks.push({
          process_id: pid,
          color_tag: p.color_tag,
          title: p.title,
          occ_start: occStart,
          occ_end: occEnd,
          share,
          is_start: best.start >= cs && best.start < cs + CELL,
          is_end: (best.end ?? now) > cs && (best.end ?? now) <= cs + CELL,
        });
      }
    }
    return cells;
  },

  async qFirstDay() {
    const days = state.segs.map((g) => dayOfTs(g.start));
    return days.length ? days.sort()[0] : null;
  },

  async exportEvents() {
    return "mock://events.json（浏览器环境不落盘）";
  },

  async qRestState() {
    return {
      resting: state.resting,
      since: state.restSince,
      source: state.resting ? "ring_full" : null,
      reading_ms: state.resting ? 47 * 60_000 : null,
      choice: (state.restChoice as import("./types").RestChoice) ?? null,
    };
  },

  async processRename(pid, title) {
    proc(pid).title = title;
    ev("process_rename", pid, { title });
  },

  async notesSet(pid, notes) {
    proc(pid).notes = notes;
  },
};

/** 休息态查询（mock 本地状态；Tauri 侧由 M2 接线） */
export const mockRest = {
  isResting: () => state.resting,
  restSince: () => state.restSince,
  restSource: () => state.restSource,
  setResting(v: boolean) {
    state.resting = v;
    state.restSince = v ? Date.now() : null;
  },
};
