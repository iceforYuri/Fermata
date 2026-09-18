import { useState } from "react";
import { dayStr, MonthCalendar } from "./MonthCalendar";
import { BigRing } from "./BigRing";
import { DayViewSection } from "./DayViewSection";
import { DayGridView } from "./DayGridView";
import { YearView } from "./YearView";

type View = "year" | "month" | "day";

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return dayStr(new Date(y, m - 1, d + delta));
}

/**
 * 统计页（Tab 2）：视角胶囊 [年|月|日]；月=月历+大环+当天视图；日=96 格日网格；年=月环网格。
 * 进入默认月视角锚定今天；钻取：年点月环→月，月单击=选中、双击→日，日顶部换天、点日期回月。
 */
export function StatsPage() {
  const today = dayStr(new Date());
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(today); // 锚点日期，切视角保留
  const [ay, am] = anchor.split("-").map(Number);

  return (
    <div className="stats-page" data-testid="stats-page">
      <div className="capsule" data-testid="view-capsule">
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

      {view === "month" && (
        <>
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
        </>
      )}

      {view === "day" && (
        <DayGridView
          day={anchor}
          onPrevDay={() => setAnchor(shiftDay(anchor, -1))}
          onNextDay={() => setAnchor(shiftDay(anchor, 1))}
          onBackToMonth={() => setView("month")}
        />
      )}

      {view === "year" && (
        <YearView
          year={ay}
          onYear={(y) => setAnchor(`${y}-01-01`)}
          onDrillMonth={(y, m) => {
            setAnchor(`${y}-${String(m).padStart(2, "0")}-01`);
            setView("month");
          }}
        />
      )}
    </div>
  );
}
