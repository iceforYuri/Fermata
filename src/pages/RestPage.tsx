import { useEffect } from "react";
import { data } from "../api/data";
import { act, useBoard } from "../store/board";
import { exitRest, useUi } from "../store/ui";
import { fmtDur } from "../util";

/**
 * 休息页：液态玻璃整页（只盖自家版面）；纵向居中灰满环+中心▶=继续（hover 亮起，Enter 等价）；
 * 大字正计时；触发源回执；底部今日累计 + 热键提示。
 */
export function RestPage() {
  const { restSince, restSource } = useUi();
  const { board } = useBoard();
  const elapsed = restSince ? Date.now() - restSince : 0;
  const runningPid = board?.running?.process.id ?? null;

  const resume = () => {
    void act(async () => {
      if (runningPid) await data.restEnd(runningPid);
    }).then(() => exitRest());
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") resume();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const totalToday =
    (board?.running?.day_total_ms ?? 0) +
    (board?.completed_total_ms ?? 0) +
    (board?.suspended ?? []).reduce((a, b) => a + b.day_total_ms, 0);

  return (
    <div className="rest-page" data-testid="rest-page">
      <div
        className="rest-continue"
        data-testid="rest-continue"
        role="button"
        aria-label="继续"
        onClick={resume}
      >
        <svg width="96" height="96" viewBox="0 0 96 96">
          <circle
            cx="48"
            cy="48"
            r="45"
            fill="none"
            stroke="var(--ink-faint)"
            strokeWidth="2.5"
          />
        </svg>
        <svg className="play" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </div>
      <div className="rest-clock num">休息中 · {fmtDur(elapsed)}</div>
      <div className="rest-source">{restSource ?? "休止符"}</div>
      <div className="rest-foot">
        <span>今日累计 {fmtDur(totalToday)}</span>
        <span>Alt+Q 可切进程</span>
      </div>
    </div>
  );
}
