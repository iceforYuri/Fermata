import { useEffect, useRef, useState } from "react";
import { data, type BoardProcess } from "../api/data";
import { act, markHex, sliceMs, useBoard } from "../store/board";
import { completeWithUndo, togglePause } from "../store/actions";
import { openDetail } from "../store/ui";
import { fmtDur } from "../util";
import { TimeRing } from "./TimeRing";

/**
 * 活跃行 112px：确认条脊 / 28px 标题 / 当前步骤槽（常显勾选框，勾选推进）/
 * 时间环 64px / 累计用时低权重 / 手动暂停继续。
 */
export function ActiveRow({ bp }: { bp: BoardProcess }) {
  const board = useBoard();
  const color = markHex(board, bp.process.color_tag);
  const [ringAnchor, setRingAnchor] = useState<number | null>(null);
  const lastSliceFired = useRef<string>("");

  // 时间环锚点：开口段起点；切换进程或环走满后重置满环
  const pid = bp.process.id;
  useEffect(() => {
    setRingAnchor(bp.active_segment_started_at ?? Date.now());
    lastSliceFired.current = "";
  }, [pid, bp.active_segment_started_at]);

  const total = sliceMs(board);
  const anchor = ringAnchor ?? bp.active_segment_started_at ?? Date.now();
  const now = Date.now();
  const paused = !bp.timer_open;
  const remaining = Math.max(0, Math.min(total, total - (now - anchor))); // 暂停/未来锚点夹紧
  const pausedRemaining = useRef(remaining);
  if (!paused) pausedRemaining.current = remaining;

  // 环走满 → slice_complete 事件（休止符弹窗归 M2）
  useEffect(() => {
    if (!paused && remaining <= 0 && anchor) {
      const key = `${pid}@${anchor}`;
      if (lastSliceFired.current !== key) {
        lastSliceFired.current = key;
        void act(async () => {
          await data.sliceComplete(pid);
          await data.restTrigger(pid, "ring_full", total);
        });
        setRingAnchor(Date.now());
      }
    }
  }, [remaining, paused, anchor, pid, total]);

  const steps = bp.steps;
  const currentStep = steps.find((s) => !s.done) ?? null;

  const checkStep = (stepId: number) => {
    void act(() => data.stepCheck(stepId, true));
  };

  return (
    <div
      className={`row active${color ? "" : " no-mark"}`}
      style={{ "--mc": color ?? undefined } as React.CSSProperties}
      data-testid="active-row"
      data-pid={pid}
    >
      <div
        className="spine"
        title="完成"
        data-testid="confirm-spine"
        onClick={(e) => {
          e.stopPropagation();
          void completeWithUndo(bp);
        }}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2 6.2 4.8 9 10 3.2" />
        </svg>
      </div>
      <div className="row-main" onClick={() => openDetail(pid)}>
        <div className="active-title">{bp.process.title}</div>
        {currentStep ? (
          <div className="current-step">
            <span
              className="step-check"
              data-testid="step-check"
              onClick={(e) => {
                e.stopPropagation();
                checkStep(currentStep.id);
              }}
            >
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1.5 5.2 4 7.6 8.5 2.6" />
              </svg>
            </span>
            <span className="step-text advance chevron" key={currentStep.id} data-testid="current-step">
              {currentStep.title}
            </span>
          </div>
        ) : (
          <div className="current-step" style={{ color: "var(--ink-soft)" }}>
            <span className="chevron">{bp.process.breakpoint ?? "无断点"}</span>
          </div>
        )}
      </div>
      <div className="active-side">
        <div className="active-meta">
          <button
            className="pause-btn"
            data-testid="pause-btn"
            title={paused ? "继续" : "暂停"}
            onClick={() => void togglePause(bp)}
          >
            {paused ? (
              <svg viewBox="0 0 10 10" fill="currentColor"><path d="M2 1.2v7.6L8.8 5z" /></svg>
            ) : (
              <svg viewBox="0 0 10 10" fill="currentColor">
                <rect x="2" y="1.4" width="2.2" height="7.2" />
                <rect x="5.8" y="1.4" width="2.2" height="7.2" />
              </svg>
            )}
          </button>
          <span className="active-total num">{fmtDur(bp.day_total_ms + (paused ? 0 : 0))}</span>
        </div>
        <TimeRing
          remainingMs={paused ? pausedRemaining.current : remaining}
          totalMs={total}
          color={color}
          dimmed={paused}
          testid="time-ring"
        />
      </div>
    </div>
  );
}
