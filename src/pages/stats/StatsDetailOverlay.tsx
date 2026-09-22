import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { data, type ProcessDetail } from "../../api/data";
import { act, markHex, todayStr, useBoard } from "../../store/board";
import { closeStatsDetail, useUi } from "../../store/ui";
import { fmtClock, fmtDur } from "../../util";
import { dayStr } from "./MonthCalendar";

const STATE_LABEL: Record<string, string> = {
  suspended: "挂起",
  running: "进行中",
  waiting_ai: "挂起 · 等 AI",
  completed: "已完成",
};

/**
 * 统计页进程详情子页（2026-09-22）：页内玻璃遮盖 + 居中实心卡，按 pid 直查不绑定当天版面。
 * 只读展示：标题/断点/步骤栈/当日分段/个人记录；回归 = 回今天（默认）或日历卡选今天起的日期。
 * portal 到 body：fixed 坐标不被页面过渡的 transform 劫持（同断点卡）。
 */
export function StatsDetailOverlay() {
  const { statsDetail } = useUi();
  if (!statsDetail) return null;
  return (
    <StatsDetailInner key={`${statsDetail.pid}:${statsDetail.day}`} pid={statsDetail.pid} day={statsDetail.day} />
  );
}

function StatsDetailInner({ pid, day }: { pid: number; day: string }) {
  const board = useBoard();
  const [detail, setDetail] = useState<ProcessDetail | null>(null);
  const [calOpen, setCalOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    void data
      .qProcessDetail(pid, day)
      .then((d) => alive && setDetail(d))
      .catch(() => alive && setDetail(null));
    return () => {
      alive = false;
    };
  }, [pid, day, board.tick]);

  const today = todayStr();
  const regather = (target: string) => {
    void act(() => data.processRegather(pid, target)).then(closeStatsDetail);
  };

  return createPortal(
    <div
      className="archive-backdrop"
      data-testid="stats-detail"
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("archive-backdrop")) closeStatsDetail();
      }}
    >
      <div className="archive-panel sd-panel">
        {calOpen ? (
          <RegatherCalendar onPick={regather} onBack={() => setCalOpen(false)} />
        ) : detail ? (
          <DetailCard
            detail={detail}
            day={day}
            today={today}
            colorHex={markHex(board, detail.process.color_tag)}
            onRegatherToday={() => regather(today)}
            onOpenCal={() => setCalOpen(true)}
          />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

function DetailCard({
  detail,
  day,
  today,
  colorHex,
  onRegatherToday,
  onOpenCal,
}: {
  detail: ProcessDetail;
  day: string;
  today: string;
  colorHex: string | null;
  onRegatherToday: () => void;
  onOpenCal: () => void;
}) {
  const p = detail.process;
  const closedSegs = detail.segments;
  const segTotal = closedSegs.reduce((a, s) => a + (s.ended_at ?? Date.now()) - s.started_at, 0);
  const canRegather = p.board_date !== today || p.state === "completed";

  return (
    <div className="sd-card" style={{ "--mc": colorHex ?? undefined } as React.CSSProperties}>
      <div className="sd-head">
        <div className="sd-title-row">
          {colorHex && <span className="sd-mark" style={{ background: colorHex }} />}
          <span className="sd-title" data-testid="sd-title">{p.title}</span>
        </div>
        <button className="sd-close" title="收起" data-testid="sd-close" onClick={closeStatsDetail}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
      <div className="sd-meta">
        {STATE_LABEL[p.state] ?? p.state} · 排入 {p.board_date} · 当日投入{" "}
        <span className="num">{fmtDur(detail.day_total_ms)}</span>
      </div>

      <section className="detail-section">
        <div className="detail-label">断点</div>
        <div className="sd-breakpoint" data-testid="sd-breakpoint">
          {detail.stack_top ? detail.stack_top.title : "未留断点"}
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-label">步骤栈</div>
        <div data-testid="sd-steps">
          {detail.steps.map((s) => (
            <div key={s.id} className={`detail-step${s.done ? " done" : ""}${s.kind === "note" ? " note" : ""}`}>
              {s.kind === "note" ? <span className="step-note-mark">▸</span> : <span className="step-check readonly">
                {s.done && (
                  <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M1.5 5.2 4 7.6 8.5 2.6" />
                  </svg>
                )}
              </span>}
              <span className="step-text">{s.title}</span>
            </div>
          ))}
          {detail.steps.length === 0 && <div className="sd-empty">没有步骤</div>}
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-label">分段时长 · {day}</div>
        <div data-testid="sd-segs">
          {closedSegs.map((s) => (
            <div className="seg-row" key={s.id}>
              <span className="num">
                {fmtClock(s.started_at)}–{s.ended_at ? fmtClock(s.ended_at) : "现在"}
              </span>
              <span className="num">{fmtDur((s.ended_at ?? Date.now()) - s.started_at)}</span>
              {s.note && <span className="seg-note">{s.note}</span>}
            </div>
          ))}
          {closedSegs.length === 0 && <div className="sd-empty">这一天没有分段</div>}
          {closedSegs.length > 0 && (
            <div className="seg-row sd-seg-total">
              <span>合计</span>
              <span className="num">{fmtDur(segTotal)}</span>
            </div>
          )}
        </div>
      </section>

      <section className="detail-section">
        <div className="detail-label">个人记录</div>
        <div className="sd-notes" data-testid="sd-notes">
          {p.notes?.trim() ? p.notes : <span className="sd-empty">没有记录</span>}
        </div>
      </section>

      {canRegather && (
        <section className="detail-section">
          <div className="detail-label">回归</div>
          <div className="sd-actions">
            <button className="back-today" data-testid="sd-regather-today" onClick={onRegatherToday}>
              回归到今天
            </button>
            <button className="back-today" data-testid="sd-regather-cal" onClick={onOpenCal}>
              选一天…
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * 回归日历卡：月历表格（无环），左右翻月不选年；
 * 过去日期置灰不可选（历史不改写），点今天/未来日期即回归。
 */
function RegatherCalendar({ onPick, onBack }: { onPick: (day: string) => void; onBack: () => void }) {
  const today = todayStr();
  const [ty, tm] = today.split("-").map(Number);
  const [[y, m], setYm] = useState<[number, number]>([ty, tm]);

  const first = new Date(y, m - 1, 1);
  const dim = new Date(y, m, 0).getDate();
  const leadBlanks = (first.getDay() + 6) % 7; // 周一打头
  const cells: (number | null)[] = [
    ...Array(leadBlanks).fill(null),
    ...Array.from({ length: dim }, (_, i) => i + 1),
  ];
  const canPrev = y > ty || (y === ty && m > tm);
  const shift = (d: number) => {
    const nd = new Date(y, m - 1 + d, 1);
    setYm([nd.getFullYear(), nd.getMonth() + 1]);
  };

  return (
    <div className="sd-card regather-card" data-testid="regather-cal">
      <div className="regather-cal-head">
        <button
          className="regather-nav"
          data-testid="regather-prev"
          disabled={!canPrev}
          onClick={() => canPrev && shift(-1)}
        >
          ‹
        </button>
        <span className="num">{y} 年 {m} 月</span>
        <button className="regather-nav" data-testid="regather-next" onClick={() => shift(1)}>
          ›
        </button>
      </div>
      <div className="month-cal regather-cal">
        <div className="month-cal-dow">
          {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="month-cal-grid">
          {cells.map((dnum, i) => {
            if (dnum === null) return <span key={i} className="cal-cell blank" />;
            const ds = dayStr(new Date(y, m - 1, dnum));
            const past = ds < today;
            return (
              <div
                key={i}
                className={`cal-cell regather-cell${past ? " past" : ""}${ds === today ? " today" : ""}`}
                data-testid="regather-cell"
                data-day={ds}
                onClick={() => !past && onPick(ds)}
              >
                <span className="cal-num num">{dnum}</span>
              </div>
            );
          })}
        </div>
      </div>
      <button className="back-today regather-back" data-testid="regather-back" onClick={onBack}>
        返回详情
      </button>
    </div>
  );
}
