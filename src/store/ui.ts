/** UI 状态 store：面板开合、当前 tab、撤销 toast、主题 */

import { useSyncExternalStore } from "react";

export type Tab = "board" | "stats" | "settings";

interface UiState {
  tab: Tab;
  leftOpen: boolean;
  rightPid: number | null;
  archiveOpen: boolean;
  toast: { pid: number; title: string; wasRunning: boolean; deadline: number } | null;
}

let state: UiState = {
  tab: "board",
  leftOpen: false,
  rightPid: null,
  archiveOpen: false,
  toast: null,
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

export function closeDetail() {
  setUi({ rightPid: null });
}

export function showToast(t: UiState["toast"]) {
  setUi({ toast: t });
}
