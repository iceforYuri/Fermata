import { useEffect, useState } from "react";
import { data, type DayShares } from "../../api/data";
import { DonutRing } from "./DonutRing";

export function dayStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 月历：整月 7 列网格居中不滚动；每格 = 日期小数字 + 迷你日环（按色标聚合）；
 * 空日子不画环；未来日期不画；今天有标记。单击=选中，双击=下钻日视角。
 */
export function MonthCalendar({
  anchor,
  onSelect,
  onDrill,
}: {
  anchor: string;
  onSelect: (day: string) => void;
  onDrill: (day: string) => void;
}) {
  const [y, m] = anchor.split("-").map(Number);
  const [shares, setShares] = useState<DayShares[]>([]);
  useEffect(() => {
    void data.qMonthCalendar(y, m).then(setShares);
  }, [y, m]);

  const today = dayStr(new Date());
  const byDay = new Map(shares.map((s) => [s.day, s.shares]));
  const first = new Date(y, m - 1, 1);
  const dim = new Date(y, m, 0).getDate();
  const leadBlanks = (first.getDay() + 6) % 7; // 周一打头
  const cells: (number | null)[] = [
    ...Array(leadBlanks).fill(null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];

  return (
    <div className="month-cal" data-testid="month-cal">
      <div className="month-cal-dow">
        {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="month-cal-grid">
        {cells.map((dnum, i) => {
          if (dnum === null) return <span key={i} className="cal-cell blank" />;
          const ds = dayStr(new Date(y, m - 1, dnum));
          const sh = byDay.get(ds);
          const isFuture = ds > today;
          return (
            <div
              key={i}
              className={`cal-cell${ds === anchor ? " selected" : ""}${ds === today ? " today" : ""}${isFuture ? " future" : ""}`}
              data-testid="cal-cell"
              data-day={ds}
              onClick={() => onSelect(ds)}
              onDoubleClick={() => onDrill(ds)}
            >
              <span className="cal-num num">{dnum}</span>
              {!isFuture && sh && sh.length > 0 ? (
                <DonutRing shares={sh} size={26} stroke={3.5} />
              ) : (
                <span className="cal-empty" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
