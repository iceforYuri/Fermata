import { useRef, useState } from "react";
import { dayStr, MonthCalendar } from "./MonthCalendar";
import { BigRing } from "./BigRing";
import { DayViewSection } from "./DayViewSection";
import { DayGridView } from "./DayGridView";
import { YearView } from "./YearView";
import { StatsDetailOverlay } from "./StatsDetailOverlay";

type View = "year" | "month" | "day";
const ORDER: Record<View, number> = { year: 0, month: 1, day: 2 };

/**
 * 统计页（Tab 2）：视角胶囊钉住不动；视角切换 = 纵向钻取滑动（成对进出 240ms，
 * 下钻新页下方升起/旧页上让，上钻反向）。月历不滚动；日=纵向增量滚动；年=月环。
 */
export function StatsPage() {
  const today = dayStr(new Date());
  const [view, setView] = useState<View>("month");
  const [outgoing, setOutgoing] = useState<{ view: View; dir: 1 | -1 } | null>(null);
  const [anchor, setAnchor] = useState(today); // 锚点日期，切视角保留
  const [ay, am] = anchor.split("-").map(Number);
  const outTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drillTo = (next: View) => {
    if (next === view) return;
    const dir = ORDER[next] > ORDER[view] ? 1 : -1;
    if (outTimer.current) clearTimeout(outTimer.current);
    setOutgoing({ view, dir });
    setView(next);
    outTimer.current = setTimeout(() => setOutgoing(null), 240);
  };

  const renderView = (v: View) => {
    if (v === "month") {
      return (
        <div className="stats-scroll">
          <div className="stats-measure">
            <div className="stats-month-head">
              <span className="num stats-month-title">{ay} 年 {am} 月</span>
              {anchor !== today && (
                <button className="back-today" data-testid="back-today" onClick={() => setAnchor(today)}>
                  回到今天
                </button>
              )}
            </div>
            <MonthCalendar
              anchor={anchor}
              onSelect={(d) => setAnchor(d)}
              onDrill={(d) => {
                setAnchor(d);
                drillTo("day");
              }}
            />
            <BigRing day={anchor} />
            <DayViewSection day={anchor} />
          </div>
        </div>
      );
    }
    if (v === "day") {
      return (
        <div className="view-stretch" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <DayGridView
            day={anchor}
            onAnchor={setAnchor}
            onBackToMonth={() => drillTo("month")}
            enter={outgoing !== null}
            enterDir={outgoing?.dir ?? 1}
          />
        </div>
      );
    }
    return (
      <div className="stats-scroll">
        <div className="stats-measure">
          <YearView
            year={ay}
            onYear={(y) => setAnchor(`${y}-01-01`)}
            onDrillMonth={(y, m) => {
              setAnchor(`${y}-${String(m).padStart(2, "0")}-01`);
              drillTo("month");
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="stats-page" data-testid="stats-page">
      <div className="capsule" data-testid="view-capsule" style={{ flex: "none" }}>
        {(["year", "month", "day"] as View[]).map((v) => (
          <button
            key={v}
            className={`capsule-seg${view === v ? " active" : ""}`}
            data-testid={`capsule-${v}`}
            onClick={() => drillTo(v)}
          >
            {{ year: "年", month: "月", day: "日" }[v]}
          </button>
        ))}
      </div>

      <div className="drill-stage" data-testid="drill-stage">
        {outgoing && (
          <div
            className={`drill-layer ${outgoing.dir === 1 ? "drill-out-up" : "drill-out-down"}`}
            data-testid="drill-outgoing"
          >
            {renderView(outgoing.view)}
          </div>
        )}
        <div
          className={`drill-layer current ${outgoing && view !== "day" ? (outgoing.dir === 1 ? "drill-in-below" : "drill-in-above") : ""}`}
          data-testid="drill-current"
        >
          {renderView(view)}
        </div>
      </div>

      <StatsDetailOverlay />
    </div>
  );
}
