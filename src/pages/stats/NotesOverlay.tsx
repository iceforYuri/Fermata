import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { data, type NoteEntry } from "../../api/data";
import { markHex, useBoard } from "../../store/board";
import { closeNotes, openNotes, openStatsDetail, useUi } from "../../store/ui";
import { useExiting } from "../../components/useExiting";
import { fmtClock } from "../../util";

/** 归月键：更新戳优先，无戳（存量）回退排入日 */
function monthKey(e: NoteEntry): string {
  if (e.notes_updated_at) {
    const d = new Date(e.notes_updated_at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  return e.board_date.slice(0, 7);
}
function sortKey(e: NoteEntry): number {
  return e.notes_updated_at ?? Date.parse(`${e.board_date}T00:00:00`);
}
function timeText(e: NoteEntry): string {
  if (!e.notes_updated_at) return `排入 ${e.board_date}`;
  const d = new Date(e.notes_updated_at);
  return `记于 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${fmtClock(e.notes_updated_at)}`;
}

/**
 * 个人记录子页（2026-09-22 定稿）：页内玻璃 + 居中栏（完成档案同款语言）。
 * 全部时间的非空记录按月分组倒序；无序列表、色标点当项目符号；点行开该进程详情卡。
 * 顶部预留「月度汇总」位（v1.x 接 LLM，当前只留排版钩子）。
 */
export function NotesEntry({ anchor }: { anchor: string }) {
  const [counts, setCounts] = useState<{ total: number; month: number }>({ total: 0, month: 0 });
  useEffect(() => {
    let alive = true;
    void data.qNotesDigest().then((rows) => {
      if (!alive) return;
      const m = anchor.slice(0, 7);
      setCounts({ total: rows.length, month: rows.filter((e) => monthKey(e) === m).length });
    });
    return () => {
      alive = false;
    };
  }, [anchor]);
  if (counts.total === 0) return null;
  return (
    <button className="notes-entry" data-testid="notes-entry" onClick={openNotes}>
      {counts.month > 0 ? `个人记录 · 本月 ${counts.month} 条 →` : `个人记录 · 共 ${counts.total} 条 →`}
    </button>
  );
}

export function NotesOverlay() {
  const { notesOpen } = useUi();
  const { mounted, exiting } = useExiting(notesOpen);
  if (!mounted) return null;
  return <NotesInner exiting={exiting} />;
}

function NotesInner({ exiting }: { exiting: boolean }) {
  const board = useBoard();
  const [entries, setEntries] = useState<NoteEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    void data.qNotesDigest().then((rows) => alive && setEntries(rows));
    return () => {
      alive = false;
    };
  }, [board.tick]);

  const groups = (() => {
    const byMonth = new Map<string, NoteEntry[]>();
    for (const e of entries ?? []) {
      const k = monthKey(e);
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k)!.push(e);
    }
    return [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([k, items]) => ({
        key: k,
        label: `${Number(k.slice(0, 4))} 年 ${Number(k.slice(5))} 月`,
        items: items.sort((a, b) => sortKey(b) - sortKey(a)),
      }));
  })();

  return createPortal(
    <div
      className={`archive-backdrop${exiting ? " exiting" : ""}`}
      data-testid="notes-overlay"
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("archive-backdrop")) closeNotes();
      }}
    >
      <div className="archive-panel notes-panel">
        <div className="archive-title notes-head">
          <span>个人记录 · 共 {(entries ?? []).length} 条</span>
          <span className="notes-summary-slot" title="后续接入 LLM 的每月小结">
            月度汇总 · 后续接入
          </span>
        </div>
        {groups.map((g) => (
          <section className="detail-section" key={g.key}>
            <div className="detail-label">
              {g.label} · {g.items.length} 条
            </div>
            {g.items.map((e) => {
              const hex = markHex(board, e.color_tag);
              return (
                <div
                  className="note-row"
                  key={e.process_id}
                  data-testid="note-row"
                  data-pid={e.process_id}
                  onClick={() => {
                    closeNotes();
                    openStatsDetail(e.process_id, e.board_date);
                  }}
                >
                  <span className="note-dot" style={{ background: hex ?? "var(--ring-neutral)" }} />
                  <div className="note-body">
                    <div className="note-meta">
                      <span className="note-title">{e.title}</span>
                      <span className={`num note-time${e.notes_updated_at ? "" : " legacy"}`}>
                        {timeText(e)}
                      </span>
                    </div>
                    <div className="note-text">{e.notes}</div>
                  </div>
                </div>
              );
            })}
          </section>
        ))}
        {entries !== null && entries.length === 0 && (
          <div style={{ color: "var(--ink-ghost)", fontSize: "var(--fs-small)" }}>
            还没有写下任何记录。
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
