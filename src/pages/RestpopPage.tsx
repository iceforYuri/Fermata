import { useEffect } from "react";
import { markHex, useBoard } from "../store/board";
import {
  chooseRest,
  closeRestpopKeepResting,
  deferRest,
  nextProcessFromRest,
  resumeFromRest,
} from "../store/actions";
import { useState } from "react";
import { fmtDur } from "../util";

/**
 * 休止符弹窗：实心暖卡、不抢焦点、无超时。
 * 三主按钮：暂不休息 / 休息 / 翻下一篇；✕=保持休息态；Esc=✕。
 * 休息态原地变形：正计时 + 我回来了。
 */
export function RestpopPage() {
  const board = useBoard();
  const [nextOpen, setNextOpen] = useState(false);
  const { rest } = board;
  const running = board.board?.running ?? null;
  const pid = running?.process.id ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closeRestpopKeepResting(pid); // Esc = ✕
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pid]);

  const sourceText =
    rest.source === "continuous"
      ? `已连续工作 ${rest.reading_ms ? Math.round(rest.reading_ms / 60_000) : "?"} 分钟`
      : `时间片走满 · 第 ${rest.reading_ms ? Math.round(rest.reading_ms / 60_000) : "?"} 分钟`;

  const topAging = (board.board?.suspended ?? []).slice(0, 5);
  const restedMs = rest.since ? Date.now() - rest.since : 0;
  // 三选态 vs 休息态：弹窗出现即 rest_start（resting=true），用户选「休息」或 ✕ 后进入休息态渲染
  const restingView = rest.resting && (rest.choice === "rest" || rest.choice === "close");

  return (
    <div className="overlay-card restpop" data-testid="restpop">
      <div className="restpop-head">
        <span className="restpop-source" data-testid="restpop-source">
          {rest.resting ? sourceText : "休止符"}
        </span>
        <button
          className="restpop-close"
          title="保持休息态"
          data-testid="restpop-close"
          onClick={() => void closeRestpopKeepResting(pid)}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.3">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      </div>

      {!restingView ? (
        <>
          <div className="restpop-title">时间到了。</div>
          <div className="restpop-btns">
            <button data-testid="rest-defer" onClick={() => void deferRest(pid)}>
              暂不休息
            </button>
            <button data-testid="rest-confirm" onClick={() => void chooseRest(pid)}>
              休息
            </button>
            <button data-testid="rest-next" onClick={() => setNextOpen(!nextOpen)}>
              翻下一篇
            </button>
          </div>
          {nextOpen && (
            <div className="restpop-next" data-testid="restpop-next">
              {topAging.map((bp) => (
                <div
                  key={bp.process.id}
                  className="sw-row"
                  data-testid="restpop-next-row"
                  onClick={() => void nextProcessFromRest(pid, bp.process.id)}
                >
                  <span
                    className="sw-spine"
                    style={{ background: markHex(board, bp.process.color_tag) ?? "var(--hairline)" }}
                  />
                  <span className="sw-title">{bp.process.title}</span>
                  <span className="aging-label">挂 {fmtDur(bp.aging_ms ?? 0)}</span>
                </div>
              ))}
              {topAging.length === 0 && (
                <div style={{ color: "var(--ink-faint)", fontSize: "var(--fs-small)" }}>
                  挂起队列为空
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="restpop-resting">
          <div className="rest-clock num" data-testid="restpop-clock">
            休息中 · {fmtDur(restedMs)}
          </div>
          <button
            className="restpop-back"
            data-testid="rest-back"
            onClick={() => void resumeFromRest(pid)}
          >
            我回来了
          </button>
        </div>
      )}
    </div>
  );
}
