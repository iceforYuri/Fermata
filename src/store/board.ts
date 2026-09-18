/**
 * 版面数据 store：q_board 驱动，变更后立刷 + 10s 重同步 + 1Hz tick 重渲染计时。
 */
import { useEffect, useSyncExternalStore } from "react";
import { data, type BoardDay, type PaletteEntry, type Plan } from "../api/data";

interface BoardState {
  board: BoardDay | null;
  plans: Plan[];
  palette: Record<"light" | "dark", string[]>;
  settings: Record<string, string>;
  fetchedAt: number;
  tick: number; // 1Hz
}

let state: BoardState = {
  board: null,
  plans: [],
  palette: { light: [], dark: [] },
  settings: {},
  fetchedAt: Date.now(),
  tick: 0,
};

const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function set(patch: Partial<BoardState>) {
  state = { ...state, ...patch };
  emit();
}

export function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export async function refreshBoard() {
  const day = todayStr();
  const [board, plans, palette, settings] = await Promise.all([
    data.qBoard(day),
    data.qPlans(),
    data.qPalette(),
    data.qSettings(),
  ]);
  const pal = { light: [] as string[], dark: [] as string[] };
  for (const e of palette as PaletteEntry[]) pal[e.theme][e.slot] = e.hex;
  set({
    board,
    plans,
    palette: pal,
    settings: Object.fromEntries(settings),
    fetchedAt: Date.now(),
  });
}

/** 变更动作包装：执行后立即刷新版面 */
export async function act(fn: () => Promise<unknown>) {
  await fn();
  await refreshBoard();
}

export function getBoard(): BoardState {
  return state;
}

export function useBoard(): BoardState {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
  useEffect(() => {
    refreshBoard();
    const sync = setInterval(refreshBoard, 10_000); // 与后端重同步
    const tick = setInterval(() => set({ tick: state.tick + 1 }), 1_000); // 1Hz 本地计时
    return () => {
      clearInterval(sync);
      clearInterval(tick);
    };
  }, []);
  return s;
}

/** 色标 → 当前主题 hex */
export function markHex(s: BoardState, slot: number | null): string | null {
  if (slot === null) return null;
  const theme = (s.settings.theme === "dark" ? "dark" : "light") as "light" | "dark";
  return s.palette[theme][slot] ?? null;
}

export function sliceMs(s: BoardState): number {
  return (parseInt(s.settings.slice_minutes ?? "45", 10) || 45) * 60_000;
}
