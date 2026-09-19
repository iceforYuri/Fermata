import { useState } from "react";
import { data, type BoardProcess } from "../api/data";
import { act, markHex, useBoard } from "../store/board";
import { completeWithUndo } from "../store/actions";
import { agingOpacity, fmtDur } from "../util";

/**
 * 挂起行 64px：标题 15 / 导语小字（栈顶条目）/ 老化"挂 23m" /
 * 对数渐褪，hover 复活手型；点击=断点小卡切换；拖动=排序（4px 阈值+弹性挤位+落点虚影）；
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

const ROW_PITCH = 74; // 64px 行高 + 10px 间距
const SQUEEZE = "transform 220ms cubic-bezier(0.34, 1.36, 0.64, 1)"; // 弹簧挤位

/** 挂起队列：点击切换、拖动排序（虚影+挤位）、拖过折线到活跃位=切换 */
export function SuspendedQueue({
  rows,
  day,
  onRequestSwitch,
  onDragOverActive, // 拖到活跃位松手
}: {
  rows: BoardProcess[];
  day: string;
  onRequestSwitch: (pid: number, rect: DOMRect) => void;
  onDragOverActive: (active: boolean) => void;
}) {
  const board = useBoard();
  const [drag, setDrag] = useState<{ pid: number; dy: number; insertAt: number; overActive: boolean } | null>(null);
  const [dropHint, setDropHint] = useState(false);

  const onRowPointerDown = (e: React.PointerEvent, pid: number) => {
    if ((e.target as HTMLElement).closest(".spine")) return;
    const startY = e.clientY;
    const origIdx = rows.findIndex((r) => r.process.id === pid);
    let cur = { pid, dy: 0, insertAt: origIdx, overActive: false };
    let moved = false;

    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dy) <= 4) return; // 4px 阈值
      moved = true;
      const queueEl = document.querySelector("[data-testid='suspended-queue']");
      const activeEl = document.querySelector("[data-testid='active-row']");
      const qTop = queueEl?.getBoundingClientRect().top ?? 0;
      const foldY = activeEl ? activeEl.getBoundingClientRect().bottom : qTop;
      const overActive = ev.clientY < foldY - 8; // 折线上方 = 活跃位
      const ids = rows.map((r) => r.process.id).filter((id) => id !== pid);
      // 插入位：以队列首行 top 为原点按行距换算
      let insertAt = Math.round((ev.clientY - qTop) / ROW_PITCH);
      insertAt = Math.max(0, Math.min(ids.length, insertAt));
      insertAt = insertAt > origIdx ? insertAt - 1 : insertAt;
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

  return (
    <div
      data-testid="suspended-queue"
      className={dropHint ? "board-drop-hint" : ""}
      style={{ position: "relative" }}
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
      {rows.map((bp) => {
        if (drag && bp.process.id === drag.pid) {
          // 被拖行：跟随指针（transform-only）
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
        // 弹性挤位：虚影插入位之后的行下移一格
        let shift = 0;
        if (drag && !drag.overActive) {
          const ids = rows.map((r) => r.process.id).filter((id) => id !== drag.pid);
          const myIdxInIds = ids.indexOf(bp.process.id);
          if (myIdxInIds >= drag.insertAt) shift = ROW_PITCH;
        }
        return (
          <div
            key={bp.process.id}
            style={{
              transform: shift ? `translateY(${shift}px)` : undefined,
              transition: drag ? SQUEEZE : undefined,
            }}
          >
            <SuspendedRow bp={bp} onDragStart={onRowPointerDown} />
          </div>
        );
      })}
      {/* 落点虚影：半透明轮廓卡 */}
      {drag && !drag.overActive && (
        <div
          className="row drop-ghost"
          data-testid="drop-ghost"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: drag.insertAt * ROW_PITCH + (drag.insertAt > rows.findIndex((r) => r.process.id === drag.pid) ? -0 : 0),
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
