/**
 * 数据层薄封装 —— 组件只允许经这一层读写数据内核。
 * 命名与 CONTEXT.md 词汇一致；command 参数 camelCase，Rust 侧自动转 snake_case。
 */
import { invoke } from "@tauri-apps/api/core";

export type ProcessState = "suspended" | "running" | "waiting_ai" | "completed";

export interface Process {
  id: number;
  title: string;
  state: ProcessState;
  prev_state: string | null;
  color_tag: number | null;
  breakpoint: string | null;
  created_at: number;
  activated_count: number;
  completed_at: number | null;
  queue_position: number | null;
  board_date: string;
}

export interface Step {
  id: number;
  process_id: number;
  title: string;
  done: boolean;
  done_at: number | null;
  position: number;
}

export interface Plan {
  id: number;
  title: string;
  est_minutes: number | null;
  scheduled_date: string | null;
  state: "pool" | "completed" | "deleted";
  created_at: number;
  completed_at: number | null;
  position: number | null;
}

export interface GikaEvent {
  id: number;
  ts: number;
  kind: string;
  process_id: number | null;
  payload: string | null;
}

export interface BoardProcess {
  process: Process;
  steps: Step[];
}

export interface BoardDay {
  day: string;
  running: BoardProcess | null;
  suspended: BoardProcess[]; // 含 waiting_ai，按挂起队列序
  completed: BoardProcess[];
}

export interface SliceStats {
  complete: number;
  aborted: number;
}

export interface PaletteEntry {
  theme: "light" | "dark";
  slot: number;
  hex: string;
}

export type RestChoice = "defer" | "rest" | "next" | "close";

export const data = {
  // ---- 进程 ----
  processCreate: (title: string, colorTag?: number, boardDate?: string) =>
    invoke<number>("process_create", { title, colorTag, boardDate }),
  processSwitch: (pid: number, breakpoint?: string) =>
    invoke<void>("process_switch", { pid, breakpoint }),
  processComplete: (pid: number) => invoke<void>("process_complete", { pid }),
  processReopen: (pid: number) => invoke<void>("process_reopen", { pid }),
  processPause: (pid: number) => invoke<void>("process_pause", { pid }),
  processResume: (pid: number) => invoke<void>("process_resume", { pid }),
  breakpointSet: (pid: number, text: string) =>
    invoke<void>("breakpoint_set", { pid, text }),
  colorSet: (pid: number, slot: number | null) =>
    invoke<void>("color_set", { pid, slot }),
  waitingAiSet: (pid: number, on: boolean) =>
    invoke<void>("waiting_ai_set", { pid, on }),

  // ---- 步骤 ----
  stepAdd: (pid: number, title: string) => invoke<number>("step_add", { pid, title }),
  stepCheck: (stepId: number, done: boolean) =>
    invoke<void>("step_check", { stepId, done }),
  stepsReorder: (pid: number, orderedStepIds: number[]) =>
    invoke<void>("steps_reorder", { pid, orderedStepIds }),
  queueReorder: (day: string, orderedPids: number[]) =>
    invoke<void>("queue_reorder", { day, orderedPids }),

  // ---- 稿库 ----
  planCreate: (title: string, estMinutes?: number, scheduledDate?: string) =>
    invoke<number>("plan_create", { title, estMinutes, scheduledDate }),
  planUpdate: (
    id: number,
    patch: { title?: string; estMinutes?: number; scheduledDate?: string },
  ) => invoke<void>("plan_update", { id, ...patch }),
  planDone: (id: number) => invoke<void>("plan_done", { id }),
  planDelete: (id: number) => invoke<void>("plan_delete", { id }),

  // ---- 系统层事件（M2 空闲/休止符/时间环） ----
  idleStart: (runningPid?: number) => invoke<void>("idle_start", { runningPid }),
  idleEnd: (runningPid?: number) => invoke<void>("idle_end", { runningPid }),
  restTrigger: (pid: number | null, source: "ring_full" | "continuous", readingMs: number) =>
    invoke<void>("rest_trigger", { pid, source, readingMs }),
  restChoice: (pid: number | null, choice: RestChoice) =>
    invoke<void>("rest_choice", { pid, choice }),
  restStart: (pid?: number) => invoke<void>("rest_start", { pid }),
  restEnd: (pid?: number) => invoke<void>("rest_end", { pid }),
  sliceComplete: (pid: number) => invoke<void>("slice_complete", { pid }),
  sliceAborted: (pid: number, elapsedMs: number) =>
    invoke<void>("slice_aborted", { pid, elapsedMs }),

  // ---- 查询 ----
  qBoard: (day: string) => invoke<BoardDay>("q_board", { day }),
  qProcessDayTotal: (pid: number, day: string) =>
    invoke<number>("q_process_day_total", { pid, day }),
  qSuspendedMs: (pid: number, day: string) =>
    invoke<number>("q_suspended_ms", { pid, day }),
  qSliceStats: (pid: number, day: string) =>
    invoke<SliceStats>("q_slice_stats", { pid, day }),
  qContinuousWorkMs: (day: string) =>
    invoke<number>("q_continuous_work_ms", { day }),
  qEvents: (day?: string) => invoke<GikaEvent[]>("q_events", { day }),
  qSettings: () => invoke<[string, string][]>("q_settings"),
  qPalette: () => invoke<PaletteEntry[]>("q_palette"),
  qPlans: () => invoke<Plan[]>("q_plans"),
};
