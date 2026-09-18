import { useEffect, useState } from "react";
import { data, type YearOverview } from "../../api/data";
import { DonutRing } from "./DonutRing";

/** 年视图：12 月环网格，纵向滚动，只显示有记录的年份范围；点月环下钻月视角 */
export function YearView({
  year,
  onYear,
  onDrillMonth,
}: {
  year: number;
  onYear: (y: number) => void;
  onDrillMonth: (y: number, m: number) => void;
}) {
  const [ov, setOv] = useState<YearOverview | null>(null);
  useEffect(() => {
    void data.qYearOverview(year).then(setOv);
  }, [year]);
  if (!ov) return null;

  const byMonth = new Map(ov.months.map((m) => [m.month, m.shares]));
  return (
    <div className="yearview" data-testid="yearview">
      <div className="daygrid-nav">
        <button
          data-testid="year-prev"
          disabled={!ov.available_years.includes(year - 1)}
          onClick={() => onYear(year - 1)}
        >
          ‹
        </button>
        <span className="num">{year}</span>
        <button
          data-testid="year-next"
          disabled={!ov.available_years.includes(year + 1)}
          onClick={() => onYear(year + 1)}
        >
          ›
        </button>
      </div>
      <div className="year-grid">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const shares = byMonth.get(m);
          return (
            <div
              key={m}
              className={`year-cell${shares ? "" : " empty"}`}
              data-testid="year-month"
              data-month={m}
              onClick={() => shares && onDrillMonth(year, m)}
            >
              {shares ? (
                <DonutRing shares={shares} size={56} stroke={7} />
              ) : (
                <span className="cal-empty" style={{ width: 56, height: 56 }} />
              )}
              <span className="num year-month-label">{m} 月</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
