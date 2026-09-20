import { useEffect, useState } from "react";
import { data, type DayView } from "../../api/data";
import { act, markHex, useBoard } from "../../store/board";
import { fmtDur } from "../../util";
import { InlineEdit } from "../../components/InlineEdit";
import { animateRowLeave } from "../../components/rowAnim";

/**
 * 当天视图（清单视角）：已做 / 进行中 / 未做 / 计划编辑 / 挂起成本。
 * 计划与 Tab1 稿库同源（plans 表），跨 tab 经 store-changed 同步。
 */
export function DayViewSection({ day }: { day: string }) {
  const board = useBoard();
  const [view, setView] = useState<DayView | null>(null);
  const [newPlan, setNewPlan] = useState("");
  useEffect(() => {
    void data.qDayView(day).then(setView);
  }, [day, board.tick, board.plans]); // board.plans：计划变更立即反映，不等 1Hz tick
  if (!view) return null;

  return (
    <div className="dayview" data-testid="dayview">
      <section className="dv-section" data-testid="dv-done">
        <div className="detail-label">已做</div>
        {view.done.map((p) => (
          <div className="row dv-row" key={p.process_id} style={{ "--mc": markHex(board, p.color_tag) ?? undefined } as React.CSSProperties}>
            <div className="spine" style={{ cursor: "default" }} />
            <div className="row-main">
              <div className="suspended-title">{p.title}</div>
            </div>
            <div className="row-tail"><span className="num">{fmtDur(p.ms)}</span></div>
          </div>
        ))}
        {view.done.length === 0 && <Empty line="这一天还没有完成的进程" />}
      </section>

      <section className="dv-section" data-testid="dv-ongoing">
        <div className="detail-label">进行中</div>
        {view.ongoing.map((p) => (
          <div className="row dv-row" key={p.process_id} style={{ "--mc": markHex(board, p.color_tag) ?? undefined } as React.CSSProperties}>
            <div className="spine" style={{ cursor: "default" }} />
            <div className="row-main">
              <div className="suspended-title">{p.title}</div>
              {p.steps_total > 0 && (
                <div className="suspended-sub">步骤 {p.steps_done}/{p.steps_total}</div>
              )}
            </div>
            <div className="row-tail"><span className="num">{fmtDur(p.ms)}</span></div>
          </div>
        ))}
        {view.ongoing.length === 0 && <Empty line="没有进行中的进程" />}
      </section>

      <section className="dv-section" data-testid="dv-notdone">
        <div className="detail-label">未做</div>
        {view.not_done.map((p) => (
          <div className="dv-plan" key={p.id} data-testid="dv-notdone-row">{p.title}</div>
        ))}
        {view.not_done.length === 0 && <Empty line="没有开天窗的计划" />}
      </section>

      <section className="dv-section" data-testid="dv-plans">
        <div className="detail-label">计划（该天）</div>
        {view.plans.map((p) => (
          <div
            className={`dv-plan${p.state === "completed" ? " done" : ""}`}
            key={p.id}
            data-testid="dv-plan-row"
            data-state={p.state}
          >
            {/* 完成态禁编辑但保持同一 InlineEdit 节点：划线/降淡过渡才连续 */}
            <InlineEdit
              value={p.title}
              className="dv-plan-title"
              testid="dv-plan-title"
              disabled={p.state !== "pool"}
              onCommit={(v) => {
                if (v) void act(() => data.planUpdate(p.id, { title: v }));
              }}
            />
            {p.state === "completed" && <span className="dv-tag">未计时完成</span>}
            {p.state === "completed" && (
              <span className="plan-ops-inline">
                <button
                  className="dv-reopen"
                  title="放回稿库"
                  data-testid="dv-plan-reopen"
                  onClick={() => void act(() => data.planReopen(p.id))}
                >
                  ↩
                </button>
              </span>
            )}
            {p.state === "pool" && (
              <span className="plan-ops-inline">
                <button data-testid="dv-plan-done" onClick={() => void act(() => data.planDone(p.id))}>✓</button>
                <button
                  data-testid="dv-plan-del"
                  onClick={(e) =>
                    animateRowLeave(
                      (e.currentTarget as HTMLElement).closest(".dv-plan"),
                      () => void act(() => data.planDelete(p.id)),
                    )
                  }
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        ))}
        <div className="step-ghost">
          <span>+</span>
          <input
            data-testid="dv-plan-input"
            placeholder="为这一天加条计划"
            value={newPlan}
            onChange={(e) => setNewPlan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPlan.trim()) {
                void act(() => data.planCreate(newPlan.trim(), undefined, day));
                setNewPlan("");
              }
            }}
          />
        </div>
      </section>

      <section className="dv-section" data-testid="dv-costs">
        <div className="detail-label">挂起成本</div>
        {view.suspended_costs.map((c) => (
          <div className="dv-plan" key={c.process_id} data-testid="dv-cost-row">
            <span className="dv-plan-title">{c.title}</span>
            <span className="aging-label num">
              {c.retrieved ? `挂 ${fmtDur(c.waited_ms)} 后捞回` : `仍挂着 · ${fmtDur(c.waited_ms)}`}
            </span>
          </div>
        ))}
        {view.suspended_costs.length === 0 && <Empty line="没有挂起成本" />}
      </section>
    </div>
  );
}

function Empty({ line }: { line: string }) {
  return <div style={{ color: "var(--ink-ghost)", fontSize: "var(--fs-small)", padding: "2px 0" }}>{line}</div>;
}
