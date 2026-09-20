import { useState } from "react";
import { data, type BoardProcess } from "../api/data";
import { act, markHex, useBoard } from "../store/board";
import { completeWithUndo } from "../store/actions";
import { agingOpacity, fmtDur } from "../util";
import { ROW_PITCH, SQUEEZE, isOverActive, queueInsertAt } from "./dnd";

/**
 * 挂起行 64px：标题 15 / 导语小字（栈顶条目）/ 老化"挂 23m" /
 * 对数渐褪，hover 复活手型；点击=断点小卡切换；拖动=排序（先塌陷后开缝+落点虚影）；
 * 拖过折线到活跃位=切换（虚影覆盖活跃位）。
 */
export function SuspendedRow({
  bp,
  style,
  onDragStart,
}: {
  bp: BoardProcess;
  style?: React.CSSProperties;
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
      style={{ "--mc": color ?? undefined, opacity, ...style } as React.CSSProperties}
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
          <span className="chevron" style={bp.stack_top ? undefined : { color: "var(--ink-ghost)" }}>
            {bp.stack_top?.title ?? "未留断点"}
          </span>
          <span className="aging-label">挂 {fmtDur(bp.aging_ms ?? 0)}</span>
        </div>
      </div>
      <div className="row-tail">
        <span className="num">{fmtDur(bp.day_total_ms)}</span>
      </div>
    </div>
  );
}

/**
 * 挂起队列：点击切换、拖动排序（虚影+塌陷补位）、拖过折线到活跃位=切换。
 * 稿库 HTML5 拖入的缝/虚影也在此渲染（libPreview 由 BoardPage 中列级感应换算）。
 */
export function SuspendedQueue({
  rows,
  day,
  onRequestSwitch,
  onDragOverActive,
  libPreview,
}: {
  rows: BoardProcess[];
  day: string;
  onRequestSwitch: (pid: number, rect: DOMRect) => void;
  onDragOverActive: (active: boolean) => void;
  libPreview: { insertAt: number } | null;
}) {
  const board = useBoard();
  const [drag, setDrag] = useState<{ pid: number; dy: number; insertAt: number; overActive: boolean } | null>(null);

  const onRowPointerDown = (e: React.PointerEvent, pid: number) => {
    if ((e.target as HTMLElement).closest(".spine")) return;
    const startY = e.clientY;
    let cur = { pid, dy: 0, insertAt: 0, overActive: false };
    let moved = false;

    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dy) <= 4) return; // 4px 阈值
      moved = true;
      const queueEl = document.querySelector("[data-testid='suspended-queue']");
      const activeEl = document.querySelector("[data-testid='active-row']");
      const qTop = queueEl?.getBoundingClientRect().top ?? 0;
      const overActive = isOverActive(ev.clientY, activeEl ? activeEl.getBoundingClientRect().bottom : null);
      // 塌陷空间（去掉被拖行）里的插入位
      const slotCount = rows.length - 1;
      const insertAt = queueInsertAt(ev.clientY, qTop, slotCount);
      cur = { pid, dy, insertAt, overActive };
      setDrag({ ...cur });
      onDragOverActive(overActive);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onDragOverActive(false);
      setDrag(null);
      if (!moved) {
        const main = (ev.target as HTMLElement).closest("[data-pid-main]");
        if (main) onRequestSwitch(pid, main.getBoundingClientRect());
        return;
      }
      if (cur.overActive) {
        // 拖到活跃位 = 切换；断点卡在原活跃行下展开（由 BoardPage 用活跃行 rect 承接）
        const activeEl = document.querySelector("[data-testid='active-row'] .row-main");
        onRequestSwitch(pid, activeEl?.getBoundingClientRect() ?? new DOMRect(80, 200, 10, 10));
        return;
      }
      const ids = rows.map((r) => r.process.id).filter((id) => id !== pid);
      const next = [...ids.slice(0, cur.insertAt), pid, ...ids.slice(cur.insertAt)];
      void act(() => data.queueReorder(day, next));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // 统一插入预览：pointer 拖拽优先，其次稿库拖入；overActive 时队列不开缝
  const previewAt = drag && !drag.overActive ? drag.insertAt : !drag && libPreview ? libPreview.insertAt : null;
  const origIdxOf = (pid: number) => rows.findIndex((r) => r.process.id === pid);
  const dragOrigIdx = drag ? origIdxOf(drag.pid) : -1;
  // 塌陷空间下标：被拖行之后的行为 origIdx-1，其余为 origIdx
  const collapsedIdxOf = (origIdx: number) => (drag && origIdx > dragOrigIdx ? origIdx - 1 : origIdx);

  return (
    <div data-testid="suspended-queue" style={{ position: "relative" }}>
      {rows.map((bp, origIdx) => {
        if (drag && bp.process.id === drag.pid) {
          // 被拖行：跟随指针（transform-only），原槽由后续行补位
          return (
            <div key={bp.process.id} style={{ position: "relative", zIndex: 5 }}>
              <div
                className="row suspended dragging"
                style={{
                  transform: `translateY(${drag.dy}px)`,
                  transition: "none",
                  "--mc": markHex(board, bp.process.color_tag) ?? undefined,
                } as React.CSSProperties}
                data-testid="suspended-row"
                data-pid={bp.process.id}
              >
                <RowInner bp={bp} />
              </div>
            </div>
          );
        }
        // 目标位 = 塌陷位 +（>= 插入位则让到缝后）；位移 = 目标位 - 原槽位
        const collapsedIdx = collapsedIdxOf(origIdx);
        const targetIdx = collapsedIdx + (previewAt !== null && collapsedIdx >= previewAt ? 1 : 0);
        const shift = (targetIdx - origIdx) * ROW_PITCH;
        return (
          <div
            key={bp.process.id}
            style={{
              transform: shift ? `translateY(${shift}px)` : undefined,
              transition: drag || libPreview ? SQUEEZE : undefined,
            }}
          >
            <SuspendedRow bp={bp} onDragStart={onRowPointerDown} />
          </div>
        );
      })}
      {/* 落点虚影：撑开的缝里的半透明轮廓卡 */}
      {previewAt !== null && (
        <div
          className="row drop-ghost"
          data-testid="drop-ghost"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: previewAt * ROW_PITCH,
            height: 64,
          }}
        />
      )}
    </div>
  );
}

function RowInner({ bp }: { bp: BoardProcess }) {
  const board = useBoard();
  const p = bp.process;
  const color = markHex(board, p.color_tag);
  return (
    <>
      <div className="spine" />
      <div className="row-main">
        <div className="suspended-title">{p.title}</div>
        <div className="suspended-sub">
          <span className="chevron">{bp.stack_top?.title ?? "未留断点"}</span>
        </div>
      </div>
      <div className="row-tail">
        <span className="num">{fmtDur(bp.day_total_ms)}</span>
      </div>
      <span style={{ display: "none" }}>{color}</span>
    </>
  );
}
