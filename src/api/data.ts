/**
 * 数据层薄封装 —— 组件只允许经这一层读写数据内核。
 * Tauri 环境走真实命令；浏览器（截图/验证）走 mock 内核。
 */
import { invoke } from "@tauri-apps/api/core";
import type { DataApi } from "./types";
import { mockData } from "./mock";

export * from "./types";

export const isTauri = "__TAURI_INTERNALS__" in window;

const tauriData: DataApi = {
  processCreate: (title, colorTag, boardDate) =>
    invoke("process_create", { title, colorTag, boardDate }),
  processSwitch: (pid, breakpoint) => invoke("process_switch", { pid, breakpoint }),
  processComplete: (pid) => invoke("process_complete", { pid }),
  processReopen: (pid) => invoke("process_reopen", { pid }),
  processPause: (pid) => invoke("process_pause", { pid }),
  processResume: (pid) => invoke("process_resume", { pid }),
  breakpointSet: (pid, text) => invoke("breakpoint_set", { pid, text }),
  entryDelete: (stepId) => invoke("entry_delete", { stepId }),
  colorSet: (pid, slot) => invoke("color_set", { pid, slot }),
  waitingAiSet: (pid, on) => invoke("waiting_ai_set", { pid, on }),
  stepAdd: (pid, title) => invoke("step_add", { pid, title }),
  stepCheck: (stepId, done) => invoke("step_check", { stepId, done }),
  stepsReorder: (pid, orderedStepIds) => invoke("steps_reorder", { pid, orderedStepIds }),
  queueReorder: (day, orderedPids) => invoke("queue_reorder", { day, orderedPids }),
  planCreate: (title, estMinutes, scheduledDate) =>
    invoke("plan_create", { title, estMinutes, scheduledDate }),
  planUpdate: (id, patch) => invoke("plan_update", { id, ...patch }),
  planDone: (id) => invoke("plan_done", { id }),
  planDelete: (id) => invoke("plan_delete", { id }),
  idleStart: (runningPid) => invoke("idle_start", { runningPid }),
  idleEnd: (runningPid) => invoke("idle_end", { runningPid }),
  restTrigger: (pid, source, readingMs) => invoke("rest_trigger", { pid, source, readingMs }),
  restChoice: (pid, choice) => invoke("rest_choice", { pid, choice }),
  restStart: (pid) => invoke("rest_start", { pid }),
  restEnd: (pid) => invoke("rest_end", { pid }),
  sliceComplete: (pid) => invoke("slice_complete", { pid }),
  sliceAborted: (pid, elapsedMs) => invoke("slice_aborted", { pid, elapsedMs }),
  qBoard: (day) => invoke("q_board", { day }),
  qProcessDayTotal: (pid, day) => invoke("q_process_day_total", { pid, day }),
  qSuspendedMs: (pid, day) => invoke("q_suspended_ms", { pid, day }),
  qSliceStats: (pid, day) => invoke("q_slice_stats", { pid, day }),
  qContinuousWorkMs: (day) => invoke("q_continuous_work_ms", { day }),
  qEvents: (day) => invoke("q_events", { day }),
  qSettings: () => invoke("q_settings"),
  qPalette: () => invoke("q_palette"),
  qPlans: () => invoke("q_plans"),
  qSegments: (pid, day) => invoke("q_segments", { pid, day }),
  segmentNote: (segmentId, note) => invoke("segment_note", { segmentId, note }),
  processRename: (pid, title) => invoke("process_rename", { pid, title }),
  notesSet: (pid, notes) => invoke("notes_set", { pid, notes }),
  settingSet: (key, value) => invoke("setting_set", { key, value }),
  idleConfirm: (pid, yes) => invoke("idle_confirm", { pid, yes }),
  qRestState: () => invoke("q_rest_state"),
  qDayStats: (day) => invoke("q_day_stats", { day }),
  qMonthCalendar: (year, month) => invoke("q_month_calendar", { year, month }),
  qYearOverview: (year) => invoke("q_year_overview", { year }),
  qDayView: (day) => invoke("q_day_view", { day }),
  qDayGrid: (day) => invoke("q_day_grid", { day }),
  qFirstDay: () => invoke("q_first_day"),
  exportEvents: () => invoke("export_events"),
};

export const data: DataApi = isTauri ? tauriData : mockData;
