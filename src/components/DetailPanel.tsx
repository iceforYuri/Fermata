import { useEffect, useRef, useState } from "react";
import { data, type BoardProcess, type Segment } from "../api/data";
import { act, markHex, todayStr, useBoard } from "../store/board";
import { closeDetail, useUi } from "../store/ui";
import { switchTo } from "../store/actions";
import { lockFor, useLocks } from "../store/locks";
import { isMobile } from "../mobile";
import { fmtClock, fmtDur } from "../util";
import { InlineEdit } from "./InlineEdit";

/**
 * 右栏 · 详情：标题（点击编辑）→ 断点 → 步骤清单 → 分段时长 → 个人记录 → 色标行。
 * 全部就地编辑，无表单痕迹。
 */
export function DetailPanel() {
  const { rightPid } = useUi();
  const board = useBoard();
  const bp: BoardProcess | null =
    board.board === null
      ? null
      : [board.board.running, ...board.board.suspended, ...board.board.completed]
          .filter((x): x is BoardProcess => x !== null)
          .find((x) => x.process.id === rightPid) ?? null;

  return (
    <aside className={`detail-panel${rightPid !== null ? " open" : ""}`} data-testid="detail-panel">
      {bp && <DetailInner key={bp.process.id} bp={bp} />}
    </aside>
  );
}

function DetailInner({ bp }: { bp: BoardProcess }) {
  const board = useBoard();
  const p = bp.process;
  const color = markHex(board, p.color_tag);
  const [segs, setSegs] = useState<Segment[] | null>(null);
  // 移动端：卡内切换（docs/07-移动端.md §6：⤒=桌面 Enter，断点区=当前在做进程的断点）
  const runningBp = board.board?.running ?? null;
  const isActiveSelf = runningBp?.process.id === p.id;
  const [confirming, setConfirming] = useState(false);
  const [bpText, setBpText] = useState("");
  const lockInfo = lockFor(useLocks(), p.uuid);
  const startSwitch = () => {
    // 对端锁（docs/07 §5）：进程在其他设备运行中 → 显式接管
    if (lockInfo) {
      void act(() => data.syncTakeover(p.id));
      closeDetail();
      return;
    }
    if (!runningBp) {
      void switchTo(p.id);
      closeDetail();
      return;
    }
    setBpText(runningBp.stack_top?.title ?? "");
    setConfirming(true);
  };
  const confirmSwitch = () => {
    void switchTo(p.id, bpText.trim() || undefined);
    setConfirming(false);
    closeDetail();
  };
  const [segOpen, setSegOpen] = useState(false);

  useEffect(() => {
    void data.qSegments(p.id, todayStr()).then(setSegs);
  }, [p.id, bp.day_total_ms]);

  const closedSegs = (segs ?? []).filter((s) => s.ended_at !== null);
  const segTotal = closedSegs.reduce((a, s) => a + (s.ended_at! - s.started_at), 0);

  const addStep = (title: string) => {
    void act(() => data.stepAdd(p.id, title));
  };

  // 步骤拖动排序（复用 4px 阈值的简版）
  const dragStep = useRef<number | null>(null);
  const suppressClick = useRef(false); // 拖行松手后的尾随点击：吃掉，不进编辑
  const [stepOrder, setStepOrder] = useState<number[] | null>(null);
  const steps = stepOrder
    ? stepOrder.map((id) => bp.steps.find((s) => s.id === id)!).filter(Boolean)
    : bp.steps;

  return (
    <div className="detail-inner" style={{ "--mc": color ?? undefined } as React.CSSProperties}>
      {isMobile && <div className="m-detail-handle" />}
      {isMobile && confirming && runningBp && (
        <div className="m-switch-confirm">
          <div className="m-switch-label">「{runningBp.process.title}」留断点</div>
          <input
            className="m-switch-input"
            value={bpText}
            autoFocus
            onChange={(e) => setBpText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmSwitch();
              if (e.key === "Escape") setConfirming(false);
            }}
          />
          <button className="m-act" title="确认切换" aria-label="确认切换" onClick={confirmSwitch}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 8.5 6.5 12 13.5 4" />
            </svg>
          </button>
        </div>
      )}
      <div className={isMobile ? "m-detail-head" : undefined} style={{ display: "flex", alignItems: "flex-start" }}>
        <div className="detail-title" style={{ flex: 1 }}>
          <InlineEdit
            value={p.title}
            editColor={color}
            testid="detail-title"
            onCommit={(v) => void act(() => data.processRename(p.id, v))}
          />
        </div>
        {isMobile && (
          <div className="m-detail-actions">
            {!isActiveSelf && (
              <button className="m-act primary" title="列为当前在做" aria-label="列为当前在做" onClick={startSwitch}>
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 12V4M4.5 7.5 8 4l3.5 3.5" />
                  <path d="M3 1.8h10" />
                </svg>
              </button>
            )}
            <button className="m-act" title="关闭" aria-label="关闭" onClick={closeDetail}>
              <svg width="15" height="15" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          </div>
        )}
        <button
          onClick={closeDetail}
          title="收起"
          style={{ color: "var(--ink-faint)", padding: 4 }}
          data-testid="detail-close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      <section className="detail-section">
        <div className="detail-label">断点</div>
        <div className="detail-breakpoint">
          <InlineEdit
            value=""
            placeholder="留一句：做到哪了（写入即压栈顶）"
            editColor={color}
            testid="detail-breakpoint"
            onCommit={(v) => {
              if (v) void act(() => data.breakpointSet(p.id, v));
            }}
          />
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-label">步骤栈</div>
        <GhostStepRow onAdd={addStep} />
        {steps.map((s) => (
          <div
            key={s.id}
            className={`detail-step${s.done ? " done" : ""}${s.kind === "note" ? " note" : ""}`}
            data-testid="detail-step"
            data-kind={s.kind}
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest(".step-check")) return;
              if ((e.target as HTMLElement).closest(".inline-edit")) return; // 编辑中：文字选择优先于拖行
              dragStep.current = s.id;
              const startY = e.clientY;
              let moved = false;
              const move = (ev: PointerEvent) => {
                if (Math.abs(ev.clientY - startY) < 4 && dragStep.current !== null) return;
                moved = true;
                const els = document.querySelectorAll<HTMLElement>("[data-testid='detail-step']");
                const ids = bp.steps.map((x) => x.id).filter((id) => id !== s.id);
                let insertAt = ids.length;
                els.forEach((el, i) => {
                  const r = el.getBoundingClientRect();
                  if (ev.clientY < r.top + r.height / 2) insertAt = Math.min(insertAt, i);
                });
                setStepOrder([...ids.slice(0, insertAt), s.id, ...ids.slice(insertAt)]);
              };
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                dragStep.current = null;
                if (moved) suppressClick.current = true; // 拖行松手后的尾随点击：吃掉，不进编辑
                setStepOrder((cur) => {
                  if (cur) void act(() => data.stepsReorder(p.id, cur));
                  return null;
                });
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          >
            {s.kind === "note" ? (
              <span className="step-note-mark">▸</span>
            ) : (
              <span
                className="step-check"
                data-testid="detail-step-check"
                onClick={() => void act(() => data.stepCheck(s.id, !s.done))}
              >
                <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M1.5 5.2 4 7.6 8.5 2.6" />
                </svg>
              </span>
            )}
            <span
              onClickCapture={(e) => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  e.stopPropagation();
                  e.preventDefault();
                }
              }}
            >
              <InlineEdit
                value={s.title}
                editColor={color}
                className="step-text"
                testid={`entry-text-${s.id}`}
                onCommit={(v) => {
                  if (v && v !== s.title) void act(() => data.entryRename(s.id, v));
                }}
              />
            </span>
            <button
              className="entry-del"
              data-testid="entry-del"
              title="删除条目"
              onClick={(e) => {
                e.stopPropagation();
                void act(() => data.entryDelete(s.id));
              }}
            >
              ×
            </button>
          </div>
        ))}
      </section>

      <section className="detail-section">
        <div className="detail-label">分段时长</div>
        <div
          className="seg-summary"
          data-testid="seg-summary"
          onClick={() => setSegOpen(!segOpen)}
        >
          今日 {closedSegs.length} 段 · {fmtDur(segTotal)} {segOpen ? "▾" : "▸"}
        </div>
        {segOpen && (
          <div className="seg-list" data-testid="seg-list">
            {closedSegs.map((s) => (
              <div className="seg-row" key={s.id}>
                <span>
                  {fmtClock(s.started_at)}–{fmtClock(s.ended_at!)}
                </span>
                <span>{fmtDur(s.ended_at! - s.started_at)}</span>
                <span className="seg-note">
                  <InlineEdit
                    value={s.note ?? ""}
                    placeholder="备注"
                    editColor={color}
                    onCommit={(v) => {
                      void data.segmentNote(s.id, v).then(() => {
                        void data.qSegments(p.id, todayStr()).then(setSegs);
                      });
                    }}
                  />
                </span>
              </div>
            ))}
            {closedSegs.length === 0 && (
              <div className="seg-row" style={{ color: "var(--ink-ghost)" }}>
                今天还没有闭合的分段
              </div>
            )}
          </div>
        )}
      </section>

      <section className="detail-section">
        <div className="detail-label">个人记录</div>
        <InlineEdit
          value={p.notes ?? ""}
          placeholder="沉底的自由文本，随手记。"
          editColor={color}
          multiline
          testid="notes-area"
          onCommit={(v) => void act(() => data.notesSet(p.id, v))}
        />
      </section>

      <section className="detail-section">
        <div className="detail-label">色标</div>
        <div className="color-row" data-testid="color-row">
          {[0, 1, 2, 3, 4, 5, 6].map((slot) => (
            <span
              key={slot}
              className={`color-cell${p.color_tag === slot ? " selected" : ""}`}
              data-testid="color-cell"
              style={{ background: markHex(board, slot) ?? undefined }}
              onClick={() => void act(() => data.colorSet(p.id, slot))}
            />
          ))}
          <span
            className={`color-cell none${p.color_tag === null ? " selected" : ""}`}
            data-testid="color-cell-none"
            title="无色标"
            onClick={() => void act(() => data.colorSet(p.id, null))}
          >
            ∅
          </span>
        </div>
      </section>
    </div>
  );
}

function GhostStepRow({ onAdd }: { onAdd: (title: string) => void }) {
  const [v, setV] = useState("");
  return (
    <div className="step-ghost" data-testid="step-add-ghost">
      <span>+</span>
      <input
        placeholder="添加步骤"
        data-testid="step-add-input"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && v.trim()) {
            onAdd(v.trim());
            setV("");
          }
        }}
      />
    </div>
  );
}
