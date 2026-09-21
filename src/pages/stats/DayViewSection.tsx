import { useEffect, useRef, useState } from "react";
import { data, type DayView, type Plan } from "../../api/data";
import { act, markHex, useBoard } from "../../store/board";
import { fmtDur } from "../../util";
import { InlineEdit } from "../../components/InlineEdit";
import { animateRowLeave, EnteringRow, ENTER_MS, LeavingRow } from "../../components/rowAnim";

/**
 * 当天视图（清单视角）：已做 / 进行中 / 未做 / 计划编辑 / 挂起成本。
 * 计划与 Tab1 稿库同源（plans 表），跨 tab 经 store-changed 同步。
 * 「未做」区是计划区 ✓/↩/✕ 的联动对象——**乐观同步**：点击当帧即挂幽灵行/开缝占位，
 * 不等 refetch（否则划线/取数/沉降三条时间线脱链成两段动画）；
 * refetch 后 diff 与乐观态和解（已在 leaving 的不重挂，已确认的 entering 卸壳）。
 * 计划区操作钉视觉锚点：点击帧记起分区头屏幕位置，rAF 钉 340ms。
 */
export function DayViewSection({ day }: { day: string }) {
  const board = useBoard();
  const [view, setView] = useState<DayView | null>(null);
  const [newPlan, setNewPlan] = useState("");
  // 「未做」出入动效状态
  const [leavingRows, setLeavingRows] = useState<
    Map<number, { title: string; height: number; afterId: number | null }>
  >(new Map());
  const [enteringIds, setEnteringIds] = useState<Set<number>>(new Set());
  // 乐观进入占位：↩ 当帧挂，refetch 确认后卸壳
  const [optimisticEnter, setOptimisticEnter] = useState<Map<number, { title: string; idx0: number }>>(new Map());
  const prevNotDone = useRef<number[] | null>(null);
  const titleCache = useRef(new Map<number, string>());
  const heightCache = useRef(new Map<number, number>());
  const busyPlans = useRef(new Set<number>()); // 同一计划操作防抖
  // 视觉锚点：计划分区头
  const plansRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void data.qDayView(day).then(setView);
  }, [day, board.tick, board.plans]); // board.plans：计划变更立即反映，不等 1Hz tick

  // 「未做」出入 diff（首次装载不动）+ 乐观态和解
  useEffect(() => {
    if (!view) return;
    const cur = view.not_done.map((p) => p.id);
    for (const p of view.not_done) titleCache.current.set(p.id, p.title);
    const curSet = new Set(cur);
    // 数据已确认的乐观进入行卸壳
    setOptimisticEnter((m) => {
      if (!m.size) return m;
      const n = new Map(m);
      for (const id of m.keys()) if (curSet.has(id)) n.delete(id);
      return n.size === m.size ? m : n;
    });
    const prev = prevNotDone.current;
    prevNotDone.current = cur;
    if (prev === null) return;
    const left = prev.filter((id) => !curSet.has(id));
    const entered = cur.filter((id) => !prev.includes(id));
    if (left.length) {
      setLeavingRows((m) => {
        const n = new Map(m);
        for (const id of left) {
          if (n.has(id)) continue; // 乐观已挂（同帧起跑），不重复挂
          const idx = prev.indexOf(id);
          n.set(id, {
            title: titleCache.current.get(id) ?? "",
            height: heightCache.current.get(id) ?? 28,
            // 旧序里它后面仍在的第一行 = 沉降幽灵行的插入邻位（无则落尾）
            afterId: prev.slice(idx + 1).find((x) => curSet.has(x)) ?? null,
          });
        }
        return n;
      });
    }
    if (entered.length) {
      setEnteringIds((s) => new Set([...s, ...entered]));
      setTimeout(() => {
        setEnteringIds((s) => {
          const n = new Set(s);
          entered.forEach((id) => n.delete(id));
          return n;
        });
      }, ENTER_MS + 80);
    }
  }, [view]);

  // 视觉锚点：计划区头屏幕位置在操作前后纹丝不动。
  // rAF 钉住 340ms（= 真实布局变化窗口：刷新延迟 ~80ms + 沉降 200 / 开缝 220），
  // 只在量到位移的帧才写 scrollTop（不脏不写，避免每帧强制同步布局与行动画互踩）；
  // ✕ 的落库延迟 240ms，钉窗从动作回调（数据提交）起算。
  const pinGen = useRef(0);
  const pinAnchor = () => {
    const el = plansRef.current;
    const sc = el?.closest(".stats-scroll");
    if (!el || !sc) return;
    const gen = ++pinGen.current; // 新钉替换旧钉
    const y = el.getBoundingClientRect().top;
    const until = performance.now() + 340;
    const step = () => {
      if (gen !== pinGen.current) return;
      const d = el.getBoundingClientRect().top - y;
      if (Math.abs(d) > 0.5) sc.scrollTop += d; // 贴底/贴顶浏览器自然夹紧
      if (performance.now() < until) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  /** 乐观离场（✓/✕ 当帧）：钉锚 + 挂未做区幽灵行，标题/高度/邻位从当前 DOM 量取 */
  const optimisticLeave = (p: Plan): boolean => {
    if (busyPlans.current.has(p.id)) return false;
    busyPlans.current.add(p.id);
    pinAnchor();
    const cur = view?.not_done.map((x) => x.id) ?? [];
    const idx = cur.indexOf(p.id);
    if (idx < 0) return true; // 不在未做区（非当天 pool？）则无联动
    const afterId = cur[idx + 1] ?? null;
    setLeavingRows((m) => {
      if (m.has(p.id)) return m;
      const n = new Map(m);
      n.set(p.id, {
        title: p.title,
        height: heightCache.current.get(p.id) ?? 28,
        afterId,
      });
      return n;
    });
    return true;
  };

  /** 乐观进入（↩ 当帧）：钉锚 + 开缝占位行插在原位名次处（与后端 min(prev,len) 同口径） */
  const optimisticEnterAt = (p: Plan): boolean => {
    if (busyPlans.current.has(p.id)) return false;
    busyPlans.current.add(p.id);
    pinAnchor();
    const len = view?.not_done.length ?? 0;
    const rank = p.prev_position != null ? Math.min(p.prev_position, len) : len + 1;
    const idx0 = Math.max(0, rank - 1);
    setOptimisticEnter((m) => new Map(m).set(p.id, { title: p.title, idx0 }));
    setEnteringIds((s) => new Set(s).add(p.id));
    setTimeout(() => {
      setEnteringIds((s) => {
        const n = new Set(s);
        n.delete(p.id);
        return n;
      });
    }, ENTER_MS + 80);
    return true;
  };

  const runOp = (p: Plan, fn: () => Promise<unknown>) => {
    void act(fn).finally(() => busyPlans.current.delete(p.id));
  };

  if (!view) return null;

  // 「未做」合并序：现存行按数据序；沉降幽灵行插回原邻里位；乐观进入行插在原位名次
  type NotDoneItem =
    | { kind: "cur"; plan: (typeof view.not_done)[number] }
    | { kind: "leave"; id: number; title: string; height: number }
    | { kind: "optEnter"; id: number; title: string };
  const curSet = new Set(view.not_done.map((p) => p.id));
  const merged: NotDoneItem[] = view.not_done.map((p) => ({ kind: "cur", plan: p }));
  for (const [id, info] of leavingRows) {
    const at = info.afterId !== null ? merged.findIndex((m) => m.kind === "cur" && m.plan.id === info.afterId) : -1;
    merged.splice(at < 0 ? merged.length : at, 0, { kind: "leave", id, title: info.title, height: info.height });
  }
  for (const [id, info] of optimisticEnter) {
    if (curSet.has(id)) continue; // 数据已确认，走 cur 行（enteringIds 仍在 → 播完开缝）
    merged.splice(Math.min(info.idx0, merged.length), 0, { kind: "optEnter", id, title: info.title });
  }

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
        {merged.map((item) =>
          item.kind === "leave" ? (
            <LeavingRow
              key={`leave-${item.id}`}
              className="dv-plan"
              title={item.title}
              height={item.height}
              onGone={() =>
                setLeavingRows((m) => {
                  const n = new Map(m);
                  n.delete(item.id);
                  return n;
                })
              }
            />
          ) : item.kind === "optEnter" ? (
            <EnteringRow key={`enter-${item.id}`} className="dv-plan">
              <span data-testid="dv-notdone-row">{item.title}</span>
            </EnteringRow>
          ) : enteringIds.has(item.plan.id) ? (
            <EnteringRow key={item.plan.id} className="dv-plan">
              <span data-testid="dv-notdone-row">{item.plan.title}</span>
            </EnteringRow>
          ) : (
            <div
              className="dv-plan"
              key={item.plan.id}
              data-testid="dv-notdone-row"
              ref={(el) => {
                if (el) heightCache.current.set(item.plan.id, el.offsetHeight);
              }}
            >
              {item.plan.title}
            </div>
          ),
        )}
        {view.not_done.length === 0 && leavingRows.size === 0 && optimisticEnter.size === 0 && (
          <Empty line="没有开天窗的计划" />
        )}
      </section>

      <section className="dv-section" data-testid="dv-plans" ref={plansRef}>
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
                if (!v) return;
                pinAnchor();
                void act(() => data.planUpdate(p.id, { title: v }));
              }}
            />
            {p.state === "completed" && <span className="dv-tag">未计时完成</span>}
            {p.state === "completed" && (
              <span className="plan-ops-inline">
                <button
                  className="dv-reopen"
                  title="放回稿库"
                  data-testid="dv-plan-reopen"
                  onClick={() => {
                    // ↩ 当帧：钉锚 + 未做区开缝占位，回退命令照旧
                    if (optimisticEnterAt(p)) runOp(p, () => data.planReopen(p.id));
                  }}
                >
                  ↩
                </button>
              </span>
            )}
            {p.state === "pool" && (
              <span className="plan-ops-inline">
                <button
                  data-testid="dv-plan-done"
                  onClick={() => {
                    // ✓ 当帧：划线（CSS）+ 未做区幽灵沉降 + 钉锚，三条线同一拍起跑
                    if (optimisticLeave(p)) runOp(p, () => data.planDone(p.id));
                  }}
                >
                  ✓
                </button>
                <button
                  data-testid="dv-plan-del"
                  onClick={(e) => {
                    if (!optimisticLeave(p)) return;
                    animateRowLeave(
                      (e.currentTarget as HTMLElement).closest(".dv-plan"),
                      () => runOp(p, () => data.planDelete(p.id)),
                    );
                  }}
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
                pinAnchor();
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
