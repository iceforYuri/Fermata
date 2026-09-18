/** 版面动作：完成+撤销、切换、暂停/继续、休息态与浮层的全部出入口 */

import { data, type BoardProcess } from "../api/data";
import { system } from "../api/system";
import { act, getBoard, setPendingRest, sliceMs } from "./board";
import { getUi, showToast } from "./ui";

let toastTimer: ReturnType<typeof setTimeout> | null = null;

/** 确认条点击：立即完成（事件即事实），3 秒撤销 toast */
export async function completeWithUndo(bp: BoardProcess) {
  const p = bp.process;
  const wasRunning = p.state === "running";
  await act(() => data.processComplete(p.id));
  if (toastTimer) clearTimeout(toastTimer);
  showToast({ pid: p.id, title: p.title, wasRunning, deadline: Date.now() + 3000 });
  toastTimer = setTimeout(() => {
    showToast(null);
    toastTimer = null;
  }, 3000);
}

export async function undoComplete() {
  const toast = getUi().toast;
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = null;
  showToast(null);
  await act(async () => {
    await data.processReopen(toast.pid);
    if (toast.wasRunning) await data.processSwitch(toast.pid);
  });
}

/** 切换进程：环未满即提前切走，按 ring_elapsed 精确记 slice_aborted */
export async function switchTo(pid: number, breakpoint?: string) {
  const b = getBoard();
  const running = b.board?.running;
  if (running && running.process.id !== pid && running.timer_open) {
    const elapsed =
      running.ring_elapsed_ms + Math.max(0, Date.now() - b.fetchedAt);
    if (elapsed > 1000 && elapsed < sliceMs(b)) {
      await data.sliceAborted(running.process.id, elapsed);
    }
  }
  await act(() => data.processSwitch(pid, breakpoint));
}

export async function togglePause(bp: BoardProcess) {
  await act(() =>
    bp.timer_open ? data.processPause(bp.process.id) : data.processResume(bp.process.id),
  );
}

// ---------- 休息态（弹窗与休息页同读 DB rest_state；动作等价） ----------

/** 恢复计时的显式路径之一：暂不休息 / 我回来了 / 继续。环重置满环（slice_complete 为界）。 */
export async function resumeFromRest(pid: number | null) {
  if (pid) await data.sliceComplete(pid);
  await act(() => data.restEnd(pid ?? undefined));
  await system.hideRestpop();
  setPendingRest(null);
}

/** 暂不休息 */
export async function deferRest(pid: number | null) {
  await data.restChoice(pid, "defer");
  await resumeFromRest(pid);
}

/** 休息：进入/保持休息态（弹窗原地变休息态） */
export async function chooseRest(pid: number | null) {
  await data.restChoice(pid, "rest");
  await act(async () => {});
}

/** ✕ / Esc：关窗但保持休息态（主窗休息页仍在等） */
export async function closeRestpopKeepResting(pid: number | null) {
  await data.restChoice(pid, "close");
  await system.hideRestpop();
}

/** 翻下一篇：选老挂起 = 显式开工 = rest_end + 切换 + 关窗 */
export async function nextProcessFromRest(pid: number | null, targetPid: number, breakpoint?: string) {
  await data.restChoice(pid, "next");
  if (pid) await data.sliceComplete(pid);
  await act(() => data.restEnd(pid ?? undefined));
  await system.hideRestpop();
  setPendingRest(null);
  await switchTo(targetPid, breakpoint);
}

/** 空闲回归确认 */
export async function answerIdleConfirm(pid: number, yes: boolean) {
  await act(() => data.idleConfirm(pid, yes));
}
