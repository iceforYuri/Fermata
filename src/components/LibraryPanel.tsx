import { useEffect, useRef, useState } from "react";
import { data, type Plan } from "../api/data";
import { act, todayStr, useBoard } from "../store/board";
import { openRowMenu, setUi, useUi, closeRowMenu } from "../store/ui";
import { isMobile } from "../mobile";
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
  // 今日剩余 = 无预定日 + 预定日恰为今天；过去的计划不进稿库（归统计页那天的计划区，历史不改写）
  const todayPlans = plans.filter((p) => !p.scheduled_date || p.scheduled_date === today);
  const futurePlans = plans.filter((p) => p.scheduled_date && p.scheduled_date > today);

  // 稿库条目手势流（移动端，docs/07 §6）：长按 500ms = 操作菜单；长按后右拖出抽屉右缘 = 关抽屉 + 排入挂起队列
  // move/up 挂 window（行 DOM 只 transform 不重建，但菜单开合会动周围树）
  const libRef = useRef<HTMLDivElement>(null);
  const plansRef = useRef(plans);
  plansRef.current = plans;
  useEffect(() => {
    if (!isMobile) return;
    const el = libRef.current;
    if (!el) return;
    let pid = 0;
    let x0 = 0, y0 = 0;
    let lpTimer = 0;
    let armed = false;    // 长按已到点（菜单已开）
    let dragging = false; // 长按后右拖中
    let rowEl: HTMLElement | null = null;
    const down = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      const row = target.closest("[data-testid='plan-row']") as HTMLElement | null;
      if (!row) return;
      if (target.closest("button")) return; // ✓/✕ 按钮不拦截
      rowEl = row;
      const idAttr = row.getAttribute("data-plan-id");
      pid = idAttr ? Number(idAttr) : 0;
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY;
      armed = false; dragging = false;
      lpTimer = window.setTimeout(() => {
        armed = true;
        openRowMenu({ pid, x: x0, y: y0, kind: "plan" });
        const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener("click", eat, { capture: true, once: true });
      }, 500);
    };
    const move = (e: TouchEvent) => {
      if (!pid || !rowEl) return;
      const t = e.touches[0];
      const dx = t.clientX - x0;
      const dy = t.clientY - y0;
      if (!armed) {
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          window.clearTimeout(lpTimer);
        }
        return;
      }
      if (dx <= 0) return; // 只认右拖
      e.preventDefault();
      if (!dragging) { dragging = true; closeRowMenu(); }
      rowEl.style.transition = "none";
      rowEl.style.transform = `translateX(${dx}px)`;
    };
    const up = (e: TouchEvent) => {
      window.clearTimeout(lpTimer);
      if (!pid) return;
      if (dragging && rowEl) {
        const drawerRight = document.querySelector(".m-lib-drawer")?.getBoundingClientRect().right ?? 0;
        const endX = e.changedTouches[0].clientX;
        rowEl.style.transition = "";
        rowEl.style.transform = "";
        if (endX > drawerRight - 16) {
          const plan = plansRef.current.find((x) => x.id === pid);
          setUi({ leftOpen: false });
          if (plan) {
            void act(async () => {
              await data.processCreate(plan.title, undefined, todayStr());
              await data.planDelete(plan.id);
            });
          }
        }
      }
      pid = 0; rowEl = null; armed = false; dragging = false;
    };
    el.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.clearTimeout(lpTimer);
      el.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, []);

  const group = (title: string, items: Plan[]) => (
    <div className="lib-group" key={title}>
      <div className="lib-group-title">{title}</div>
      {items.length === 0 && (
        <div style={{ fontSize: "var(--fs-micro)", color: "var(--ink-ghost)", padding: isMobile ? "20px 10px" : "4px 10px", textAlign: isMobile ? "center" : undefined }}>
          空
        </div>
      )}
      {items.map((p) => (
        <div
          key={p.id}
          className={`plan-row${entering.has(p.id) ? " entering" : ""}`}
          data-testid="plan-row"
          data-plan-id={p.id}
          draggable={!isMobile && editingId !== p.id}
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
      <div className="lib-inner" ref={libRef}>
        <div className="lib-group-title" style={{ marginBottom: 12, letterSpacing: "0.02em" }}>
          稿库
        </div>
        {group("今日剩余", todayPlans)}
        {group("明日草稿", futurePlans)}
      </div>
    </aside>
  );
}
