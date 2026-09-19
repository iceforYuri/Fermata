import { useEffect, useRef, useState } from "react";
import { data, type BoardProcess, type Segment } from "../api/data";
import { act, markHex, todayStr, useBoard } from "../store/board";
import { closeDetail, useUi } from "../store/ui";
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
  const [stepOrder, setStepOrder] = useState<number[] | null>(null);
  const steps = stepOrder
    ? stepOrder.map((id) => bp.steps.find((s) => s.id === id)!).filter(Boolean)
    : bp.steps;

  return (
    <div className="detail-inner" style={{ "--mc": color ?? undefined } as React.CSSProperties}>
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <div className="detail-title" style={{ flex: 1 }}>
          <InlineEdit
            value={p.title}
            editColor={color}
            testid="detail-title"
            onCommit={(v) => void act(() => data.processRename(p.id, v))}
          />
        </div>
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
        <div className={`detail-breakpoint${p.breakpoint ? "" : " empty"}`}>
          <InlineEdit
            value={p.breakpoint ?? ""}
            placeholder="留一句：做到哪了"
            editColor={color}
            testid="detail-breakpoint"
            onCommit={(v) => void act(() => data.breakpointSet(p.id, v))}
          />
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-label">步骤栈</div>
        <GhostStepRow onAdd={addStep} />
        {steps.map((s) => (
          <div
            key={s.id}
            className={`detail-step${s.done ? " done" : ""}`}
            data-testid="detail-step"
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest(".step-check")) return;
              dragStep.current = s.id;
              const startY = e.clientY;
              const move = (ev: PointerEvent) => {
                if (Math.abs(ev.clientY - startY) < 4 && dragStep.current !== null) return;
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
                setStepOrder((cur) => {
                  if (cur) void act(() => data.stepsReorder(p.id, cur));
                  return null;
                });
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          >
            <span
              className="step-check"
              data-testid="detail-step-check"
              onClick={() => void act(() => data.stepCheck(s.id, !s.done))}
            >
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M1.5 5.2 4 7.6 8.5 2.6" />
              </svg>
            </span>
            <span className="step-text">{s.title}</span>
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
