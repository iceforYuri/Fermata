import { useEffect, useState } from "react";
import { data, type GridCell } from "../../api/data";
import { markHex, useBoard } from "../../store/board";
import { fmtClock, fmtDur } from "../../util";

/**
 * 96 格日网格：12 列 × 8 行，每格 15 分钟，列主序阅读；
 * 空格画极浅中性点（空隙即数据）；悬停圆圈 → 进程浮窗（实心暖卡）。
 */
export function DayGridView({
  day,
  onPrevDay,
  onNextDay,
  onBackToMonth,
}: {
  day: string;
  onPrevDay: () => void;
  onNextDay: () => void;
  onBackToMonth: () => void;
}) {
  const board = useBoard();
  const [cells, setCells] = useState<GridCell[] | null>(null);
  const [hover, setHover] = useState<{ cell: GridCell; x: number; y: number } | null>(null);
  useEffect(() => {
    void data.qDayGrid(day).then(setCells);
  }, [day, board.tick]);

  const today = (() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  })();
  const isFuture = day > today;
  const hasData = cells?.some((c) => c.owner_process_id !== null) ?? false;

  const label = `${Number(day.slice(5, 7))} 月 ${Number(day.slice(8))} 日`;

  return (
    <div className="daygrid" data-testid="daygrid">
      <div className="daygrid-nav">
        <button data-testid="daygrid-prev" onClick={onPrevDay}>‹</button>
        <button className="daygrid-date" data-testid="daygrid-date" onClick={onBackToMonth} title="回到月视角">
          {label}
        </button>
        <button data-testid="daygrid-next" onClick={onNextDay}>›</button>
      </div>

      {isFuture ? (
        <div className="daygrid-empty" data-testid="daygrid-future">尚无记录</div>
      ) : !hasData && cells ? (
        <div className="daygrid-empty" data-testid="daygrid-empty">这一天留白</div>
      ) : null}

      <div className="daygrid-grid">
        {(cells ?? []).map((c) => (
          <div key={c.cell} className="dg-cell" data-cell={c.cell}>
            {c.owner_process_id !== null ? (
              <span
                className="dg-dot"
                data-testid="dg-dot"
                data-pid={c.owner_process_id}
                style={{ background: markHex(board, c.color_tag) ?? "var(--ring-neutral)" }}
                onMouseEnter={(e) => {
                  const r = (e.target as HTMLElement).getBoundingClientRect();
                  setHover({ cell: c, x: r.left, y: r.top });
                }}
                onMouseLeave={() => setHover(null)}
              />
            ) : (
              <span className="dg-empty-dot" />
            )}
          </div>
        ))}
      </div>
      <div className="daygrid-ticks">
        {[0, 3, 6, 9].map((col) => (
          <span key={col} className="num dg-tick" style={{ gridColumnStart: col + 1 }}>
            {col / 3 * 6}
          </span>
        ))}
      </div>

      {hover && hover.cell.title && (
        <div
          className="dg-tip"
          data-testid="dg-tip"
          style={{ left: Math.min(hover.x, window.innerWidth - 260), top: hover.y - 8 }}
        >
          <div className="dg-tip-title">{hover.cell.title}</div>
          <div className="num dg-tip-time">
            {hover.cell.seg_start && fmtClock(hover.cell.seg_start)}–
            {hover.cell.seg_end && fmtClock(hover.cell.seg_end)}
            {" · "}
            {hover.cell.seg_start && hover.cell.seg_end &&
              fmtDur(hover.cell.seg_end - hover.cell.seg_start)}
          </div>
          {hover.cell.breakpoint && <div className="dg-tip-bp">断点：{hover.cell.breakpoint}</div>}
        </div>
      )}
    </div>
  );
}
