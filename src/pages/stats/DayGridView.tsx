import { useEffect, useMemo, useRef, useState } from "react";
import { data, type GridCell } from "../../api/data";
import { markHex, useBoard } from "../../store/board";
import { fmtClock, fmtDur } from "../../util";
import { dayStr } from "./MonthCalendar";

function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayStr(new Date(y, m - 1, d + n));
}

/**
 * 日视角（v1.1）：纵向连续滚动，每天=日期头+96 格网格；按天懒加载（视口外只留壳）；
 * scroll-snap 按天吸附；吸顶日期头点击回月视角；上界=最早有记录日，下界=今天；
 * 静止 ~200ms 后锚点联动。
 */
export function DayGridView({
  day,
  onAnchor,
  onBackToMonth,
}: {
  day: string;
  onAnchor: (day: string) => void;
  onBackToMonth: () => void;
}) {
  const today = dayStr(new Date());
  const [firstDay, setFirstDay] = useState<string | null>(null);
  const [hover, setHover] = useState<{ cell: GridCell; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void data.qFirstDay().then((d) => setFirstDay(d ?? today));
  }, [today]);

  const days = useMemo(() => {
    if (!firstDay) return [];
    const out: string[] = [];
    let cur = firstDay;
    let guard = 0;
    while (cur <= today && guard < 400) {
      out.push(cur);
      cur = addDays(cur, 1);
      guard++;
    }
    return out;
  }, [firstDay, today]);

  // 进场滚到锚点日
  useEffect(() => {
    if (!days.length) return;
    const el = scrollRef.current?.querySelector(`[data-day="${day}"]`);
    el?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length]);

  const onScroll = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      const root = scrollRef.current;
      if (!root) return;
      const rootTop = root.getBoundingClientRect().top;
      let current = day;
      let found = false;
      root.querySelectorAll<HTMLElement>(".day-unit").forEach((el) => {
        if (found) return;
        // 取覆盖视口中心线的单元（自由滚动下顶沿语义不可靠）
        const mid = root.scrollTop + root.clientHeight / 2;
        const elTop = el.getBoundingClientRect().top - rootTop + root.scrollTop;
        if (elTop <= mid && elTop + el.offsetHeight > mid) {
          current = el.dataset.day!;
          found = true;
        }
      });
      if (current !== day) onAnchor(current); // 静止后锚点联动
    }, 200);
  };

  if (!firstDay) return null;

  return (
    <div className="daygrid-scroll" data-testid="daygrid-scroll" ref={scrollRef} onScroll={onScroll}>
      {days.map((d) => (
        <DayUnit
          key={d}
          day={d}
          today={today}
          scrollRoot={scrollRef}
          onBackToMonth={onBackToMonth}
          onHover={setHover}
        />
      ))}
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

/** 格内标记：主导占用 ≥70% 实点；<70% 45° 斜半圆（段起=色右下、段止=色左上；中段默认右下） */
function CellMark({
  cell,
  color,
  onHover,
}: {
  cell: GridCell;
  color: string;
  onHover: (h: { cell: GridCell; x: number; y: number } | null) => void;
}) {
  const halfThreshold = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue("--grid-half-threshold") || "0.7",
  );
  const enter = (e: React.MouseEvent) => {
    const r = (e.target as HTMLElement).getBoundingClientRect();
    onHover({ cell, x: r.left, y: r.top });
  };
  if (cell.share >= halfThreshold) {
    return (
      <span
        className="dg-dot"
        data-testid="dg-dot"
        style={{ background: color }}
        onMouseEnter={enter}
        onMouseLeave={() => onHover(null)}
      />
    );
  }
  // 45° 斜半圆：右上-左下对角线切半；段起/中段=色在右下，段止=色在左上
  return (
    <svg
      className="dg-half"
      data-testid="dg-dot"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      onMouseEnter={enter}
      onMouseLeave={() => onHover(null)}
    >
      <circle cx="8" cy="8" r="7.2" fill="none" stroke={color} strokeWidth="1" opacity="0.45" />
      <circle cx="8" cy="8" r="7.2" fill={color} clipPath={`url(#halfclip-${cell.cell})`} />
      <defs>
        <clipPath id={`halfclip-${cell.cell}`}>
          <path d={`M ${cell.is_end ? "0 16 L16 0 L0 0" : "0 16 L16 0 L16 16"} Z`} />
        </clipPath>
      </defs>
    </svg>
  );
}

function DayUnit({
  day,
  today,
  scrollRoot,
  onBackToMonth,
  onHover,
}: {
  day: string;
  today: string;
  scrollRoot: React.RefObject<HTMLDivElement | null>;
  onBackToMonth: () => void;
  onHover: (h: { cell: GridCell; x: number; y: number } | null) => void;
}) {
  const board = useBoard();
  const [cells, setCells] = useState<GridCell[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // 按天懒加载：接近视口才查
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void data.qDayGrid(day).then(setCells);
          obs.disconnect();
        }
      },
      { root: scrollRoot.current, rootMargin: "900px 0px" }, // 视口 ±2 天预取
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [day, scrollRoot]);

  const isFuture = day > today;
  const hasData = cells?.some((c) => c.owner_process_id !== null) ?? false;
  const label = `${Number(day.slice(5, 7))} 月 ${Number(day.slice(8))} 日`;

  return (
    <div className="day-unit" data-day={day} ref={ref} data-testid="day-unit">
      <button
        className="day-unit-head num"
        data-testid="day-unit-head"
        onClick={onBackToMonth}
        title="回到月视角"
      >
        {label}
        {day === today && <span className="day-today-tag">今天</span>}
      </button>
      {isFuture ? (
        <div className="daygrid-empty">尚无记录</div>
      ) : cells === null ? (
        <div className="daygrid-empty" style={{ color: "var(--ink-ghost)" }}>…</div>
      ) : !hasData ? (
        <div className="daygrid-empty">这一天留白</div>
      ) : (
        <>
          <div className="daygrid-ticks" data-testid="daygrid-ticks-top">
            {["0–2", "6–8", "12–14", "18–20"].map((t, i) => (
              <span key={t} className="num dg-tick" style={{ gridColumnStart: i * 3 + 1 }}>{t}</span>
            ))}
          </div>
          <div className="daygrid-grid" data-testid="daygrid">
            {cells.map((c) => (
              <div key={c.cell} className="dg-cell" data-cell={c.cell}>
                {c.owner_process_id !== null ? (
                  <CellMark
                    cell={c}
                    color={markHex(board, c.color_tag) ?? "var(--ring-neutral)"}
                    onHover={onHover}
                  />
                ) : (
                  <span className="dg-empty-dot" />
                )}
              </div>
            ))}
          </div>
          <div className="daygrid-ticks" data-testid="daygrid-ticks-bottom">
            {["0–2", "6–8", "12–14", "18–20"].map((t, i) => (
              <span key={t} className="num dg-tick" style={{ gridColumnStart: i * 3 + 1 }}>{t}</span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
