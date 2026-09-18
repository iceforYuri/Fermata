import { useRef } from "react";
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

  // 环精确化（了结 D13）：ring_elapsed_ms 后端锚定 switch_in/slice_complete，
  // segments 闭合天然扣除暂停/空闲/休息；前端 1Hz 推算 + 10s 重同步
  const scale = board.timeScale;
  const total = sliceMs(board) / scale;
  const paused = !bp.timer_open;
  const elapsed = bp.ring_elapsed_ms + (paused ? 0 : Date.now() - board.fetchedAt);
  const remaining = total - elapsed;
  // 超时态：软模式排队中（pendingRest 指向本进程）或剩余为负 → 满环 + "+Nm"
  const pending = board.pendingRest?.pid === bp.process.id;
  const overtime = pending || remaining < 0;
  const ringFrozen = useRef(remaining);
  if (!paused) ringFrozen.current = remaining;

  const steps = bp.steps;
  const currentStep = steps.find((s) => !s.done) ?? null;

  const pid = bp.process.id;
  const checkStep = (stepId: number) => {
    void act(() => data.stepCheck(stepId, true));
  };

  return (
    <div
      className={`row active${color ? "" : " no-mark"}`}
      style={{ "--mc": color ?? undefined } as React.CSSProperties}
      data-testid="active-row"
      data-pid={bp.process.id}
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
          <span className="active-total num">{fmtDur(bp.day_total_ms)}</span>
          {overtime && (
            <span className="active-total num" data-testid="ring-overtime" style={{ color: "var(--ink)" }}>
              +{Math.max(1, Math.round((pending ? elapsed : -remaining) / 60_000))}m
            </span>
          )}
        </div>
        <TimeRing
          remainingMs={overtime && !paused ? total : paused ? Math.max(0, ringFrozen.current) : Math.max(0, Math.min(total, remaining))}
          totalMs={total}
          color={color}
          dimmed={paused}
          testid="time-ring"
        />
      </div>
    </div>
  );
}
