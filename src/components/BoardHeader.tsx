import { useBoard } from "../store/board";
import { setUi } from "../store/ui";
import { dateHeader, fmtDur } from "../util";

/** 报头：日期·星期 + 今日累计（弱化区） */
export function BoardHeader() {
  const { board } = useBoard();
  const total =
    (board?.running?.day_total_ms ?? 0) +
    (board?.completed_total_ms ?? 0) +
    (board?.suspended ?? []).reduce((a, b) => a + b.day_total_ms, 0);
  return (
    <div className="board-header" data-testid="board-header">
      <span>{dateHeader()}</span>
      <span className="total num">今日累计 {fmtDur(total)}</span>
    </div>
  );
}

/** 已完栏：弱化横条，点击弹完成档案 */
export function DoneBar() {
  const { board } = useBoard();
  const n = board?.completed.length ?? 0;
  return (
    <div
      className="donebar"
      data-testid="donebar"
      onClick={() => setUi({ archiveOpen: true })}
    >
      <span className="count num">今日已完 · {n} 件</span>
      <span>·</span>
      <span className="num">{fmtDur(board?.completed_total_ms ?? 0)}</span>
    </div>
  );
}
