import { useRef, useState } from "react";
import { data, type BoardProcess } from "../api/data";
import { act, markHex, useBoard } from "../store/board";
import { completeWithUndo } from "../store/actions";
import { agingOpacity, fmtDur } from "../util";

/**
 * 挂起行 64px：标题 15 / 断点小字（行首 ▸）/ 老化"挂 23m" /
 * 对数渐褪，hover 复活手型；点击=切换；拖动=排序（4px 阈值）；等AI 不褪色+小标记。
 */
export function SuspendedRow({
  bp,
  onDragStart,
}: {
  bp: BoardProcess;
  onDragStart?: (e: React.PointerEvent, pid: number) => void;
}) {
  const board = useBoard();
  const p = bp.process;
  const color = markHex(board, p.color_tag);
  const waiting = p.state === "waiting_ai";
  const opacity = waiting ? 1 : agingOpacity(bp.aging_ms ?? 0);

  return (
    <div
      className={`row suspended${color ? "" : " no-mark"}`}
      style={{ "--mc": color ?? undefined, opacity } as React.CSSProperties}
      data-testid="suspended-row"
      data-pid={p.id}
      data-state={p.state}
      onPointerDown={(e) => onDragStart?.(e, p.id)}
    >
      <div
        className="spine"
        title="完成"
        data-testid="confirm-spine"
        onClick={(e) => {
          e.stopPropagation();
          void completeWithUndo(bp);
        }}
      >
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2 6.2 4.8 9 10 3.2" />
        </svg>
      </div>
      <div className="row-main" data-pid-main={p.id}>
        <div className="suspended-title">{p.title}</div>
        <div className="suspended-sub">
          {waiting && <span className="waiting-mark" title="等 AI" data-testid="waiting-mark" />}
          <span className="chevron">{p.breakpoint ?? "未留断点"}</span>
          <span className="aging-label">挂 {fmtDur(bp.aging_ms ?? 0)}</span>
        </div>
      </div>
      <div className="row-tail">
        <span className="num">{fmtDur(bp.day_total_ms)}</span>
      </div>
    </div>
  );
}

/** 挂起队列：点击=断点小卡后切换、拖动排序（4px 阈值）、稿库拖入落点 */
export function SuspendedQueue({
  rows,
  day,
  onRequestSwitch,
}: {
  rows: BoardProcess[];
  day: string;
  onRequestSwitch: (pid: number, rect: DOMRect) => void;
}) {
  const [order, setOrder] = useState<number[] | null>(null); // 拖动中的乐观顺序
  const [dropHint, setDropHint] = useState(false);
  const drag = useRef<{ pid: number; startY: number; active: boolean } | null>(null);

  const display = order
    ? order.map((id) => rows.find((r) => r.process.id === id)!).filter(Boolean)
    : rows;

  const onRowPointerDown = (e: React.PointerEvent, pid: number) => {
    if ((e.target as HTMLElement).closest(".spine")) return; // 确认条不参与拖拽
    drag.current = { pid, startY: e.clientY, active: false };
    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (!d.active && Math.abs(ev.clientY - d.startY) > 4) {
        d.active = true; // 4px 阈值防误触
        setOrder(rows.map((r) => r.process.id));
      }
      if (d.active) {
        // 挂起行定高 64 + 间距 10：用拖拽起点几何直接换算插入位
        const first = document.querySelector<HTMLElement>("[data-testid='suspended-row']");
        if (!first) return;
        const top = first.getBoundingClientRect().top;
        const ids = rows.map((r) => r.process.id).filter((id) => id !== d.pid);
        let insertAt = Math.round((ev.clientY - top) / 74);
        insertAt = Math.max(0, Math.min(ids.length, insertAt));
        // 目标位在被拖行原位置之后时，剔除自身后索引回退 1
        const origIdx = rows.findIndex((r) => r.process.id === d.pid);
        const insertIdx = insertAt > origIdx ? insertAt - 1 : insertAt;
        const next = [...ids.slice(0, insertIdx), d.pid, ...ids.slice(insertIdx)];
        setOrder(next);
      }
    };
    const up = (ev: PointerEvent) => {
      const d = drag.current;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      drag.current = null;
      if (!d) return;
      if (d.active) {
        setOrder((cur) => {
          if (cur) void act(() => data.queueReorder(day, cur));
          return null;
        });
      } else {
        const main = (ev.target as HTMLElement).closest("[data-pid-main]");
        if (main) {
          onRequestSwitch(pid, main.getBoundingClientRect()); // 点击 = 断点小卡 → 切换
        }
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      data-testid="suspended-queue"
      className={dropHint ? "board-drop-hint" : ""}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/gika-plan")) {
          e.preventDefault();
          setDropHint(true);
        }
      }}
      onDragLeave={() => setDropHint(false)}
      onDrop={(e) => {
        setDropHint(false);
        const raw = e.dataTransfer.getData("text/gika-plan");
        if (!raw) return;
        const plan = JSON.parse(raw) as { id: number; title: string };
        void act(async () => {
          await data.processCreate(plan.title, undefined, day);
          await data.planDelete(plan.id);
        });
      }}
    >
      {display.map((bp) => (
        <SuspendedRow key={bp.process.id} bp={bp} onDragStart={onRowPointerDown} />
      ))}
    </div>
  );
}
