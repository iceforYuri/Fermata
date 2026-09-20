import { useEffect, useRef, useState } from "react";
import { data, type Plan } from "../api/data";
import { act, todayStr, useBoard } from "../store/board";
import { useUi } from "../store/ui";
import { InlineEdit } from "./InlineEdit";
import { animateRowLeave } from "./rowAnim";

/**
 * 左栏 · 稿库：300px 固定宽，今日剩余/明日草稿两组；
 * 条目 44px，hover 浮现 ✕/✓；标题点击原地双态编辑（编辑态禁拖）；拖入中列即成进程。
 * 行级动效：✓ 划线画出后沉降离场、✕ 直接沉降、新行（回退/新建）弹性开缝接纳。
 */
export function LibraryPanel() {
  const { leftOpen } = useUi();
  const { plans } = useBoard();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [entering, setEntering] = useState<Set<number>>(new Set());
  const seenRef = useRef<Set<number> | null>(null);
  // 初次装载不动；之后新增 id 播一次开缝接纳
  useEffect(() => {
    const cur = new Set(plans.map((p) => p.id));
    const prev = seenRef.current;
    seenRef.current = cur;
    if (prev) {
      const added = [...cur].filter((id) => !prev.has(id));
      if (added.length) {
        setEntering(new Set(added));
        const t = setTimeout(() => setEntering(new Set()), 300);
        return () => clearTimeout(t);
      }
    }
  }, [plans]);
  const today = todayStr();
  const todayPlans = plans.filter((p) => !p.scheduled_date || p.scheduled_date <= today);
  const futurePlans = plans.filter((p) => p.scheduled_date && p.scheduled_date > today);

  const group = (title: string, items: Plan[]) => (
    <div className="lib-group" key={title}>
      <div className="lib-group-title">{title}</div>
      {items.length === 0 && (
        <div style={{ fontSize: "var(--fs-micro)", color: "var(--ink-ghost)", padding: "4px 10px" }}>
          空
        </div>
      )}
      {items.map((p) => (
        <div
          key={p.id}
          className={`plan-row${entering.has(p.id) ? " entering" : ""}`}
          data-testid="plan-row"
          draggable={editingId !== p.id}
          onDragStart={(e) => {
            e.dataTransfer.setData("text/fermata-plan", JSON.stringify({ id: p.id, title: p.title }));
            e.dataTransfer.effectAllowed = "move";
          }}
        >
          <InlineEdit
            value={p.title}
            className="plan-title"
            testid="plan-title"
            onEditingChange={(ed) => setEditingId(ed ? p.id : null)}
            onCommit={(v) => {
              if (v) void act(() => data.planUpdate(p.id, { title: v }));
            }}
          />
          {p.est_minutes !== null && <span className="plan-est num">预计 {p.est_minutes}m</span>}
          <span className="plan-ops">
            <button
              title="直接完成"
              data-testid="plan-done"
              onClick={(e) =>
                animateRowLeave(
                  (e.currentTarget as HTMLElement).closest(".plan-row"),
                  () => void act(() => data.planDone(p.id)),
                  true, // 先画划线再沉降
                )
              }
            >
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M1.5 5.2 4 7.6 8.5 2.6" />
              </svg>
            </button>
            <button
              title="删除"
              data-testid="plan-del"
              onClick={(e) =>
                animateRowLeave(
                  (e.currentTarget as HTMLElement).closest(".plan-row"),
                  () => void act(() => data.planDelete(p.id)),
                )
              }
            >
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M2 2l6 6M8 2l-6 6" />
              </svg>
            </button>
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <aside className={`lib-panel${leftOpen ? " open" : ""}`} data-testid="lib-panel">
      <div className="lib-inner">
        <div className="lib-group-title" style={{ marginBottom: 12, letterSpacing: "0.02em" }}>
          稿库
        </div>
        {group("今日剩余", todayPlans)}
        {group("明日草稿", futurePlans)}
      </div>
    </aside>
  );
}
