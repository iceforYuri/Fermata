/** 版面动作：完成+撤销、切换、暂停/继续、休息态出入口 */

import { data, type BoardProcess } from "../api/data";
import { act, getBoard, sliceMs } from "./board";
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

/** 切换进程：环未满即提前切走，记一次 slice_aborted（M1 近似：以开口段取模估算；M2 由系统层精确化） */
export async function switchTo(pid: number, breakpoint?: string) {
  const b = getBoard();
  const running = b.board?.running;
  if (running && running.process.id !== pid && running.active_segment_started_at) {
    const slice = sliceMs(b);
    const elapsedInSlice = (Date.now() - running.active_segment_started_at) % slice;
    if (elapsedInSlice > 1000 && running.timer_open) {
      await data.sliceAborted(running.process.id, elapsedInSlice);
    }
  }
  await act(() => data.processSwitch(pid, breakpoint));
}

export async function togglePause(bp: BoardProcess) {
  await act(() =>
    bp.timer_open ? data.processPause(bp.process.id) : data.processResume(bp.process.id),
  );
}
