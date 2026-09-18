import { useEffect, useState } from "react";
import { data, type DayStats } from "../../api/data";
import { markHex, useBoard } from "../../store/board";
import { dayStr } from "./MonthCalendar";
import { DonutRing } from "./DonutRing";
import { fmtDur } from "../../util";

/** 大环：每进程一片（无色=中性灰），图例=进程名+时长；核心数字：总专注/切换次数/最长单段 */
export function BigRing({ day }: { day: string }) {
  const board = useBoard();
  const [stats, setStats] = useState<DayStats | null>(null);
  useEffect(() => {
    void data.qDayStats(day).then(setStats);
  }, [day]);

  if (!stats) return null;
  const shares = stats.slices.map((s) => ({ color_tag: s.color_tag, ms: s.ms }));
  const today = dayStr(new Date());

  return (
    <div className="bigring-block" data-testid="bigring">
      <div className="bigring-main">
        <DonutRing shares={shares} size={200} stroke={14} testid="big-ring" />
        <div className="bigring-nums">
          <div><span className="num big-num">{fmtDur(stats.total_ms)}</span><span className="big-cap">总专注</span></div>
          <div><span className="num big-num">{stats.switch_count}</span><span className="big-cap">切换次数</span></div>
          <div><span className="num big-num">{fmtDur(stats.longest_segment_ms)}</span><span className="big-cap">最长单段</span></div>
        </div>
      </div>
      <div className="bigring-legend" data-testid="big-ring-legend">
        {stats.slices.map((s) => (
          <div className="legend-row" key={s.process_id}>
            <span
              className="sw-spine"
              style={{ background: markHex(board, s.color_tag) ?? "var(--ring-neutral)" }}
            />
            <span className="legend-title">{s.title}</span>
            <span className="num legend-ms">{fmtDur(s.ms)}</span>
          </div>
        ))}
        {stats.slices.length === 0 && (
          <div style={{ color: "var(--ink-ghost)", fontSize: "var(--fs-small)" }}>
            {day > today ? "未来" : "这一天没有计时记录"}
          </div>
        )}
      </div>
    </div>
  );
}
