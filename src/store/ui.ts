/** UI 状态 store：面板开合、当前 tab、撤销 toast、主题 */

import { useSyncExternalStore } from "react";

export type Tab = "board" | "stats" | "settings";

interface UiState {
  tab: Tab;
  leftOpen: boolean;
  rightPid: number | null;
  archiveOpen: boolean;
  toast: { pid: number; title: string; wasRunning: boolean; deadline: number } | null;
  /** 导入确认覆盖层：带快照摘要待确认；null=关 */
  importConfirm: { path: string; processes: number; events: number; exported_at: number | null } | null;
  /** 设置页数据组的行内回执（导出路径 / 导入结果 / 错误） */
  dataEcho: string | null;
  /** 统计页进程详情子页（玻璃卡）：pid + 所查看的日期；null=关 */
  statsDetail: { pid: number; day: string } | null;
  /** 个人记录子页（玻璃）：开/关 */
  notesOpen: boolean;
}

let state: UiState = {
  tab: "board",
  leftOpen: false,
  rightPid: null,
  archiveOpen: false,
  toast: null,
  importConfirm: null,
  dataEcho: null,
  statsDetail: null,
  notesOpen: false,
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}

export function setUi(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  emit();
}

export function useUi(): UiState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

export function getUi(): UiState {
  return state;
}

export function toggleLeft() {
  // 互斥：窗口接近 1:1 时开左栏收右栏
  const narrow = window.innerWidth <= window.innerHeight * 1.15;
  const opening = !state.leftOpen;
  setUi({ leftOpen: opening, rightPid: opening && narrow ? null : state.rightPid });
}

export function openDetail(pid: number) {
  const narrow = window.innerWidth <= window.innerHeight * 1.15; // 接近 1:1
  setUi({ rightPid: pid, leftOpen: narrow ? false : state.leftOpen });
}

export function openStatsDetail(pid: number, day: string) {
  setUi({ statsDetail: { pid, day } });
}

export function closeStatsDetail() {
  setUi({ statsDetail: null });
}

export function openNotes() {
  setUi({ notesOpen: true });
}

export function closeNotes() {
  setUi({ notesOpen: false });
}

export function closeDetail() {
  setUi({ rightPid: null });
}

export function showToast(t: UiState["toast"]) {
  setUi({ toast: t });
}
