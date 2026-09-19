/**
 * 调度 tick（仅主窗挂载）：休止符双触发评估（环走满 / 连轴转），
 * 软模式入队等三间隙（主窗获焦 / 切换浮层打开 / 任务完成），硬模式到点即弹。
 * 弹窗出现即 rest_start 停表（宪法第 2 条：时间的默认值是"不计"）。
 */
import { useEffect, useRef } from "react";
import { data, type RestChoice } from "../api/data";
import { system } from "../api/system";
import { getBoard, refreshBoard, setPendingRest, sliceMs } from "./board";

async function openRestpop(pid: number | null) {
  // 弹窗出现即暂停计时
  await act0(() => data.restStart(pid ?? undefined));
  await system.showRestpop();
}

async function act0(fn: () => Promise<unknown>) {
  await fn();
  await refreshBoard();
}

export function useScheduler() {
  const firing = useRef(false);
  const prevCompleted = useRef<number | null>(null);
  const prevResting = useRef(false);
  const continuousCooling = useRef(false);

  useEffect(() => {
    // 间隙：切换浮层打开 / 主窗唤出获焦
    let disposed = false;
    let unOverlay: (() => void) | undefined;
    system
      .onOverlayVisibility((label, visible) => {
        if (!disposed && visible && (label === "switcher" || label === "main")) void maybePopup(label);
      })
      .then((fn) => { if (disposed) fn(); else unOverlay = fn; });
    // 间隙 1：主窗获焦
    const onFocus = () => void maybePopup("main-focus");
    window.addEventListener("focus", onFocus);

    const t = setInterval(tick, 1000);
    return () => {
      disposed = true;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      unOverlay?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function maybePopup(gap: string) {
    const b = getBoard();
    if (!b.pendingRest || b.rest.resting) return;
    if (firing.current) return;
    firing.current = true;
    try {
      console.log(`[m2] 软模式间隙弹窗（${gap}）`);
      await openRestpop(b.pendingRest.pid);
      setPendingRest(null);
    } finally {
      firing.current = false;
    }
  }

  async function tick() {
    const b = getBoard();
    if (!b.board) return;
    const resting = b.rest.resting;

    // rest_end 后连轴转计数归零（冷却解除）
    if (prevResting.current && !resting) continuousCooling.current = false;
    prevResting.current = resting;

    // 间隙 3：任务完成（已完数增加）
    const completedNow = b.board.completed.length;
    if (prevCompleted.current !== null && completedNow > prevCompleted.current) {
      void maybePopup("complete");
    }
    prevCompleted.current = completedNow;

    // pendingRest 清理：切换/完成后排队的休止符失效
    const running0 = b.board.running;
    if (b.pendingRest && (!running0 || running0.process.id !== b.pendingRest.pid)) {
      setPendingRest(null);
    }

    if (resting || firing.current) return;
    const running = b.board.running;
    if (!running || !running.timer_open) return;
    if (b.pendingRest) return; // 软模式排队中：计时照常、环呈超时态（ActiveRow 渲染）

    const scale = b.timeScale;
    const slice = sliceMs(b) / scale;
    const contLimitMs =
      (parseInt(b.settings.continuous_limit_minutes ?? "90", 10) || 90) * 60_000;
    const contLimit = contLimitMs / scale;

    const elapsed = running.ring_elapsed_ms + (Date.now() - b.fetchedAt);
    const cont = b.continuousWorkMs + (Date.now() - b.fetchedAt);

    // 触发 1：环走满
    if (elapsed >= slice) {
      firing.current = true;
      try {
        await data.sliceComplete(running.process.id); // 环锚点重置
        await data.restTrigger(running.process.id, "ring_full", elapsed);
        const minute = Math.round(elapsed / 60_000);
        await afterTrigger(b.settings.rest_mode, running.process.id, "ring_full", minute);
      } finally {
        firing.current = false;
      }
      return;
    }

    // 触发 2：连轴转超阈值
    if (cont >= contLimit && !continuousCooling.current) {
      firing.current = true;
      continuousCooling.current = true;
      try {
        await data.restTrigger(running.process.id, "continuous", cont);
        const minute = Math.round(cont / 60_000);
        await afterTrigger(b.settings.rest_mode, running.process.id, "continuous", minute);
      } finally {
        firing.current = false;
      }
    }
  }

  async function afterTrigger(
    mode: string | undefined,
    pid: number,
    source: "ring_full" | "continuous",
    minute: number,
  ) {
    if (mode === "hard") {
      console.log(`[m2] 硬模式到点即弹（${source}）`);
      await openRestpop(pid);
    } else {
      setPendingRest({ pid, source, readingMinute: minute });
    }
    await refreshBoard();
  }
}

export type { RestChoice };
