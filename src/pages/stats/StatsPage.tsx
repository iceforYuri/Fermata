import { useState } from "react";
import { dayStr, MonthCalendar } from "./MonthCalendar";
import { BigRing } from "./BigRing";
import { DayViewSection } from "./DayViewSection";
import { DayGridView } from "./DayGridView";
import { YearView } from "./YearView";

type View = "year" | "month" | "day";

/**
 * 统计页（Tab 2）：视角胶囊 [年|月|日]（~160ms 交叉淡化+轻微纵向位移）；
 * 月=月历（不滚动，换月仅年视角点月环/回到今天）+大环+当天视图；
 * 日=纵向滚动网格；年=月环网格。
 */
export function StatsPage() {
  const today = dayStr(new Date());
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(today); // 锚点日期，切视角保留
  const [ay, am] = anchor.split("-").map(Number);

  return (
    <div className="stats-page" data-testid="stats-page">
      <div className="capsule" data-testid="view-capsule" style={{ flex: "none" }}>
        {(["year", "month", "day"] as View[]).map((v) => (
          <button
            key={v}
            className={`capsule-seg${view === v ? " active" : ""}`}
            data-testid={`capsule-${v}`}
            onClick={() => setView(v)}
          >
            {{ year: "年", month: "月", day: "日" }[v]}
          </button>
        ))}
      </div>

      <div key={view} className={`view-fade ${view === "day" ? "view-stretch" : "stats-scroll"}`}>
        {view === "month" && (
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
                setView("day");
              }}
            />
            <BigRing day={anchor} />
            <DayViewSection day={anchor} />
          </div>
        )}

        {view === "day" && (
          <DayGridView
            day={anchor}
            onAnchor={setAnchor}
            onBackToMonth={() => setView("month")}
          />
        )}

        {view === "year" && (
          <div className="stats-measure">
            <YearView
            year={ay}
            onYear={(y) => setAnchor(`${y}-01-01`)}
            onDrillMonth={(y, m) => {
              setAnchor(`${y}-${String(m).padStart(2, "0")}-01`);
              setView("month");
            }}
          />
          </div>
        )}
      </div>
    </div>
  );
}
