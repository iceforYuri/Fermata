import { data, type Plan } from "../api/data";
import { act, todayStr, useBoard } from "../store/board";
import { useUi } from "../store/ui";

/**
 * 左栏 · 稿库：300px 固定宽，今日剩余/明日草稿两组；
 * 条目 44px，hover 浮现 ✕/✓；拖入中列即成进程（拖到折线区=直接激活）。
 */
export function LibraryPanel() {
  const { leftOpen } = useUi();
  const { plans } = useBoard();
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
          className="plan-row"
          data-testid="plan-row"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/gika-plan", JSON.stringify({ id: p.id, title: p.title }));
            e.dataTransfer.effectAllowed = "move";
          }}
        >
          <span className="plan-title">{p.title}</span>
          {p.est_minutes !== null && <span className="plan-est num">预计 {p.est_minutes}m</span>}
          <span className="plan-ops">
            <button
              title="直接完成"
              data-testid="plan-done"
              onClick={() => void act(() => data.planDone(p.id))}
            >
              <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4">
                <path d="M1.5 5.2 4 7.6 8.5 2.6" />
              </svg>
            </button>
            <button
              title="删除"
              data-testid="plan-del"
              onClick={() => void act(() => data.planDelete(p.id))}
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
