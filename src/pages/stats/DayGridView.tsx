import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  enter = false,
  enterDir = 1,
}: {
  day: string;
  onAnchor: (day: string) => void;
  onBackToMonth: () => void;
  enter?: boolean;      // 钻取进场（先隐藏态定位锚日，再播升起动画）
  enterDir?: 1 | -1;
}) {
  const today = dayStr(new Date());
  const [firstDay, setFirstDay] = useState<string | null>(null);
  const [hover, setHover] = useState<{ cell: GridCell; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHeight = useRef(0);
  const lastStart = useRef<number | null>(null);
  const [ready, setReady] = useState(!enter); // enter 时先隐藏定位，再播动画

  useEffect(() => {
    void data.qFirstDay().then((d) => setFirstDay(d ?? today));
  }, [today]);

  // 全部可及日（上界=最早有记录，下界=今天）
  const allDays = useMemo(() => {
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

  // 增量生长：窗口 [startIdx, 末尾]；初始锚日前后几天；滚近顶部 prepend 更早的天
  const anchorIdx = useMemo(() => Math.max(0, allDays.indexOf(day)), [allDays, day]);
  const [startIdx, setStartIdx] = useState<number | null>(null);
  useEffect(() => {
    if (allDays.length && startIdx === null) setStartIdx(Math.max(0, anchorIdx - 3));
  }, [allDays, anchorIdx, startIdx]);
  const days = startIdx === null ? [] : allDays.slice(startIdx);

  // 进场滚到锚点日（仅一次）：进场动画开始之前同步完成定位，杜绝中途二次定位
  useLayoutEffect(() => {
    if (!days.length || startIdx === null) return;
    const root = scrollRef.current;
    const el = root?.querySelector(`[data-day="${day}"]`);
    if (root && el) {
      root.scrollTop = (el as HTMLElement).offsetTop - root.offsetTop;
    }
    if (enter && !ready) requestAnimationFrame(() => setReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startIdx !== null]);

  // prepend 后同步补偿 scrollTop（useLayoutEffect：绘制前完成，零跳动）
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (!root || startIdx === null) return;
    if (lastStart.current !== null && startIdx < lastStart.current) {
      const delta = root.scrollHeight - lastHeight.current;
      if (delta > 0) root.scrollTop += delta;
    }
    lastStart.current = startIdx;
  }, [startIdx]);

  const onScroll = () => {
    const root = scrollRef.current;
    if (!root) return;
    lastHeight.current = root.scrollHeight;
    // 滚近顶部 → prepend 更早的天
    if (root.scrollTop < 200 && startIdx !== null && startIdx > 0) {
      setStartIdx(Math.max(0, startIdx - 10));
    }
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
    <div
      className={`daygrid-scroll${enter && ready ? (enterDir === 1 ? " drill-in-below" : " drill-in-above") : ""}`}
      style={enter && !ready ? { opacity: 0 } : undefined}
      data-testid="daygrid-scroll"
      ref={scrollRef}
      onScroll={onScroll}
    >
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
      {hover &&
        hover.cell.title &&
        // 门户到 body：轨道 transform/will-change 会把 fixed 变成相对祖先定位
        createPortal(
          <div
            className="dg-tip"
            data-testid="dg-tip"
            style={{ left: Math.min(hover.x, window.innerWidth - 260), top: hover.y - 8 }}
          >
            <div className="dg-tip-title">{hover.cell.title}</div>
            <div className="num dg-tip-time">
              {hover.cell.seg_start && fmtClock(hover.cell.seg_start)}–
              {hover.cell.seg_end ? fmtClock(hover.cell.seg_end) : "进行中"}
              {hover.cell.seg_start && hover.cell.seg_end &&
                ` · ${fmtDur(hover.cell.seg_end - hover.cell.seg_start)}`}
            </div>
            {hover.cell.breakpoint && <div className="dg-tip-bp">断点：{hover.cell.breakpoint}</div>}
          </div>,
          document.body,
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
  // 45° 斜半圆 26px：对角线切半；段起/中段=色在右下，段止=色在左上
  const tri = cell.is_end ? "0 26 L26 0 L0 0" : "0 26 L26 0 L26 26";
  return (
    <svg
      className="dg-half"
      data-testid="dg-dot"
      width="26"
      height="26"
      viewBox="0 0 26 26"
      onMouseEnter={enter}
      onMouseLeave={() => onHover(null)}
    >
      <circle cx="13" cy="13" r="11.6" fill="none" stroke={color} strokeWidth="1" opacity="0.45" />
      <circle cx="13" cy="13" r="11.6" fill={color} clipPath={`url(#halfclip-${cell.cell})`} />
      <defs>
        <clipPath id={`halfclip-${cell.cell}`}>
          <path d={`M ${tri} Z`} />
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
  const dObj = new Date(`${day}T00:00:00`);
  const wk = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dObj.getDay()];
  const [miniVisible, setMiniVisible] = useState(false);
  const bigRef = useRef<HTMLButtonElement>(null);

  // 极简吸顶小日期签：大日期标滚出视口时出现
  useEffect(() => {
    const el = bigRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        // 仅当大日期标从视口顶沿滚出（向下滚过）时出吸顶小签；单元在下方不算
        const e = entries[0];
        const rootTop = scrollRoot.current?.getBoundingClientRect().top ?? 0;
        setMiniVisible(!e.isIntersecting && e.boundingClientRect.top < rootTop);
      },
      { root: scrollRoot.current },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [scrollRoot]);

  return (
    <div className="day-unit" data-day={day} ref={ref} data-testid="day-unit">
      <button
        className={`day-mini-head num${miniVisible ? " on" : ""}`}
        data-testid="day-unit-head"
        onClick={onBackToMonth}
        title="回到月视角"
      >
        {Number(day.slice(8))} {wk}
        {day === today ? " · 今天" : ""}
      </button>
      <div className="daygrid-body">
        {isFuture ? (
          <div className="daygrid-empty">尚无记录</div>
        ) : cells === null ? (
          <div className="daygrid-empty" style={{ color: "var(--ink-ghost)" }}>…</div>
        ) : !hasData ? (
          <div className="daygrid-empty">这一天留白</div>
        ) : (
          <>
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
              {[["6", 3], ["12", 6], ["18", 9], ["24", 12]].map(([t, line]) => (
                <span key={t} className="num dg-tick" style={{ left: (line as number) * 36 }}>{t}</span>
              ))}
            </div>
          </>
        )}
        <button
          className="day-big-label"
          data-testid="day-big-label"
          ref={bigRef}
          onClick={onBackToMonth}
          title="回到月视角"
        >
          <span className="num day-big-num">{Number(day.slice(8))}</span>
          <span className="day-big-wk">{wk}</span>
        </button>
      </div>
    </div>
  );
}
