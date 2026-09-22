import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { data, type BoardProcess } from "../api/data";
import { act, markHex, setSliceOverride, sliceMs, useBoard } from "../store/board";
import { completeWithUndo, togglePause } from "../store/actions";
import { openDetail } from "../store/ui";
import { fmtDur } from "../util";
import { TimeRing } from "./TimeRing";
import { useExiting } from "./useExiting";

/**
 * 活跃行 112px：确认条脊 / 28px 标题 / 当前步骤槽（常显勾选框，勾选推进）/
 * 时间环 64px / 累计用时低权重 / 手动暂停继续。
 */
export function ActiveRow({ bp }: { bp: BoardProcess }) {
  const board = useBoard();
  const [sliceOpen, setSliceOpen] = useState(false);
  const sliceExit = useExiting(sliceOpen);
  const ringWrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sliceOpen) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setSliceOpen(false);
    const clickOut = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-testid=time-ring-btn]") &&
          !(e.target as HTMLElement).closest("[data-testid=slice-card]")) setSliceOpen(false);
    };
    window.addEventListener("keydown", close);
    window.addEventListener("mousedown", clickOut);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("mousedown", clickOut);
    };
  }, [sliceOpen]);
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

  // 统一栈：就地勾选框只在栈顶条目是未完成步骤时出现（ADR-0005）
  const steps = bp.steps;
  const stackTop = bp.stack_top;
  const currentStep =
    stackTop && stackTop.kind === "step"
      ? steps.find((s) => !s.done && s.title === stackTop.title) ?? null
      : null;

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
            <span
              className="chevron"
              style={stackTop ? undefined : { color: "var(--ink-ghost)" }}
            >
              {stackTop?.title ?? "未留断点"}
            </span>
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
        <div style={{ position: "relative" }} ref={ringWrapRef}>
          <div
            className="ring-click"
            data-testid="time-ring-btn"
            title="调本次时间片"
            onClick={() => setSliceOpen((v) => !v)}
          >
            <TimeRing
              remainingMs={overtime && !paused ? total : paused ? Math.max(0, ringFrozen.current) : Math.max(0, Math.min(total, remaining))}
              totalMs={total}
              color={color}
              dimmed={paused}
              testid="time-ring"
            />
          </div>
          {sliceExit.mounted &&
            // portal 到 body：逃出 .row 的 overflow:hidden 裁切与老化行的层叠上下文（D42 规则）
            createPortal(
              <div
                className={`slice-card${sliceExit.exiting ? " exiting" : ""}`}
                data-testid="slice-card"
                style={(() => {
                  const r = ringWrapRef.current?.getBoundingClientRect();
                  return r ? { top: r.bottom + 8, right: window.innerWidth - r.right } : {};
                })()}
              >
                {[25, 45, 90].map((m) => (
                  <button
                    key={m}
                    className={`choice-chip${sliceMs(board) === m * 60_000 ? " active" : ""}`}
                    data-testid={`slice-opt-${m}`}
                    onClick={() => {
                      // 只调本次：写事件 + 当前环重置满环继续
                      void act(async () => {
                        await data.sliceComplete(bp.process.id);
                        await data.sliceOverride(bp.process.id, m);
                      });
                      setSliceOverride(bp.process.id, m);
                      setSliceOpen(false);
                    }}
                  >
                    {m}m
                  </button>
                ))}
                <SliceCustom
                  onCommit={(m) => {
                    void act(async () => {
                      await data.sliceComplete(bp.process.id);
                      await data.sliceOverride(bp.process.id, m);
                    });
                    setSliceOverride(bp.process.id, m);
                    setSliceOpen(false);
                  }}
                />
              </div>,
              document.body,
            )}
        </div>
      </div>
    </div>
  );
}

/** 自定义时间片分钟数：chip 大小的行内输入（1px 下划线为唯一编辑指示；Enter 提交，Esc 还原） */
function SliceCustom({ onCommit }: { onCommit: (minutes: number) => void }) {
  const [val, setVal] = useState("");
  const commit = () => {
    const n = Math.round(Number(val));
    if (Number.isFinite(n) && n >= 1) onCommit(Math.min(480, n));
  };
  return (
    <span className="choice-chip slice-custom">
      <input
        data-testid="slice-custom"
        value={val}
        placeholder="自定义"
        inputMode="numeric"
        className="num"
        onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ""))}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setVal("");
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <span className="slice-custom-unit">m</span>
    </span>
  );
}
