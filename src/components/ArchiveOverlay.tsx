import { data } from "../api/data";
import { act, markHex, useBoard } from "../store/board";
import { setUi, useUi } from "../store/ui";
import { fmtDur } from "../util";
import { useExiting } from "./useExiting";

/**
 * 完成档案：浮层子页面，版式同中列进程行（范围更小），周边页内玻璃遮盖；
 * 行保留色脊；点模糊区或再点已完栏收起；支持重新打开（回挂起队列尾部）。
 * 出场：glass-out + card-out（useExiting 保持挂载播反场）。
 */
export function ArchiveOverlay() {
  const { archiveOpen } = useUi();
  const { mounted, exiting } = useExiting(archiveOpen);
  const board = useBoard();
  if (!mounted) return null;
  const completed = board.board?.completed ?? [];
  return (
    <div
      className={`archive-backdrop${exiting ? " exiting" : ""}`}
      data-testid="archive"
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("archive-backdrop")) {
          setUi({ archiveOpen: false });
        }
      }}
    >
      <div className="archive-panel">
        <div className="archive-title">完成档案 · 今日 {completed.length} 件</div>
        {completed.map((bp) => {
          const color = markHex(board, bp.process.color_tag);
          return (
            <div
              key={bp.process.id}
              className={`row archive-row${color ? "" : " no-mark"}`}
              style={{ "--mc": color ?? undefined } as React.CSSProperties}
              data-testid="archive-row"
              data-pid={bp.process.id}
            >
              <div className="spine" style={{ cursor: "default" }} />
              <div className="row-main">
                <div className="suspended-title">{bp.process.title}</div>
                <div className="suspended-sub">
                  <span className="num">{fmtDur(bp.day_total_ms)}</span>
                </div>
              </div>
              <div className="row-tail">
                <span
                  className="reopen"
                  data-testid="archive-reopen"
                  onClick={() => {
                    void act(() => data.processReopen(bp.process.id));
                  }}
                >
                  重新打开
                </span>
              </div>
            </div>
          );
        })}
        {completed.length === 0 && (
          <div style={{ color: "var(--ink-faint)", fontSize: "var(--fs-small)" }}>
            今天还没有完成的进程。
          </div>
        )}
      </div>
    </div>
  );
}
