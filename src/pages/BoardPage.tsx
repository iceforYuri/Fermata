import { useEffect, useRef, useState } from "react";
import { data } from "../api/data";
import { system } from "../api/system";
import { act, refreshBoard, todayStr, useBoard } from "../store/board";
import { answerIdleConfirm, switchTo } from "../store/actions";
import { ActiveRow } from "../components/ActiveRow";
import { BoardHeader, DoneBar } from "../components/BoardHeader";
import { EmptyState } from "../components/EmptyState";
import { BreakpointCard, IdleConfirmCard } from "../components/MicroCards";
import { NewProcessRow } from "../components/NewProcessRow";
import { SuspendedQueue } from "../components/SuspendedRow";
import { isOverActive, queueInsertAt } from "../components/dnd";

/**
 * 进程页（Tab 1）：报头 → 已完栏 → 折线 → 活跃行 → 挂起队列 → + 号。
 * 休息态时整页被休息页取代（App 层处理）。
 * 中列整列是稿库拖入的感应区：dragover 实时换算插入位（队列缝+虚影 / 活跃位虚影覆盖），
 * 松手落位：空板=直接激活；活跃位=断点卡归属原活跃；队列位=挂到该位。
 */
export function BoardPage() {
  const { board } = useBoard();
  const [pendingSwitch, setPendingSwitch] = useState<{ pid: number; rect: DOMRect } | null>(null);
  const [dragOverActive, setDragOverActive] = useState(false);
  const [libDrag, setLibDrag] = useState<{ insertAt: number; overActive: boolean } | null>(null);
  const [idlePrompt, setIdlePrompt] = useState<{ pid: number; title: string } | null>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // 空闲接线：以 DB 计时状态幂等（防重复事件）；确认卡只在本会话亲历 idle_start 后出现
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let sawIdleStart = false;
    const apply = async (idling: boolean) => {
      const b = await data.qBoard(todayStr());
      const running = b.running ?? null;
      if (idling) {
        if (running && running.timer_open) {
          await data.idleStart(running.process.id);
          sawIdleStart = true;
          await refreshBoard();
        }
      } else {
        if (running && !running.timer_open) {
          await data.idleEnd(running.process.id);
          await refreshBoard();
        }
        if (sawIdleStart && running) {
          sawIdleStart = false;
          setIdlePrompt({ pid: running.process.id, title: running.process.title });
        }
      }
    };
    system
      .idleCurrent()
      .then((i) => {
        if (!disposed) void apply(i);
      })
      .catch(() => {});
    system
      .onIdleChange((i) => {
        if (!disposed) void apply(i);
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  if (!board) return null;
  const day = board.day;
  const empty =
    !board.running && board.suspended.length === 0 && board.completed.length === 0;
  const runningTitle = board.running?.process.title ?? "上一件事";

  /** 光标 y → 落点几何（活跃位 or 队列插入位），pointer/HTML5 拖共用 */
  const locate = (clientY: number): { insertAt: number; overActive: boolean } => {
    const inner = innerRef.current;
    const activeEl = inner?.querySelector("[data-testid='active-row']");
    const activeBottom = activeEl ? activeEl.getBoundingClientRect().bottom : null;
    if (board.running && isOverActive(clientY, activeBottom)) {
      return { insertAt: 0, overActive: true };
    }
    const queueEl = inner?.querySelector("[data-testid='suspended-queue']");
    const qTop = queueEl?.getBoundingClientRect().top ?? clientY;
    return { insertAt: queueInsertAt(clientY, qTop, board.suspended.length), overActive: false };
  };

  const onColumnDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("text/fermata-plan")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setLibDrag(locate(e.clientY));
  };
  const onColumnDragLeave = (e: React.DragEvent) => {
    // 拖出中列才收缝（子元素间移动 relatedTarget 仍在列内）
    if (!innerRef.current?.contains(e.relatedTarget as Node | null)) setLibDrag(null);
  };
  const onColumnDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("text/fermata-plan");
    const at = locate(e.clientY);
    setLibDrag(null);
    if (!raw) return;
    e.preventDefault();
    const plan = JSON.parse(raw) as { id: number; title: string };
    void act(async () => {
      const pid = await data.processCreate(plan.title, undefined, day);
      await data.planDelete(plan.id);
      if (empty) {
        await data.processSwitch(pid); // 空板直接激活（F3：没有旧进程可留断点）
        return;
      }
      if (at.overActive && board.running) {
        // 激活语义：断点卡从原活跃行下方展开（与点击切换同待遇）
        const activeEl = innerRef.current?.querySelector("[data-testid='active-row'] .row-main");
        setPendingSwitch({ pid, rect: activeEl?.getBoundingClientRect() ?? new DOMRect(80, 200, 10, 10) });
        return;
      }
      // 挂到插入位
      const ids = board.suspended.map((r) => r.process.id).filter((id) => id !== pid);
      const next = [...ids.slice(0, at.insertAt), pid, ...ids.slice(at.insertAt)];
      await data.queueReorder(day, next);
    });
  };

  return (
    <div
      ref={innerRef}
      className="center-inner"
      data-testid="board-page"
      onDragOver={onColumnDragOver}
      onDragLeave={onColumnDragLeave}
      onDrop={onColumnDrop}
    >
      <BoardHeader />
      <DoneBar />
      <hr className="foldline" />
      {empty ? (
        <>
          {/* 空板：虚影落唯一位置（活跃槽），松手直接激活 */}
          {libDrag && (
            <div className="row drop-ghost" data-testid="drop-ghost" style={{ height: 112 }} />
          )}
          <EmptyState />
        </>
      ) : (
        <>
          {board.running && (
            <div style={{ position: "relative" }}>
              <ActiveRow bp={board.running} />
              {(dragOverActive || libDrag?.overActive) && (
                <div className="active-drop-ghost" data-testid="active-drop-ghost" />
              )}
            </div>
          )}
          <SuspendedQueue
            rows={board.suspended}
            day={day}
            libPreview={libDrag && !libDrag.overActive ? { insertAt: libDrag.insertAt } : null}
            onRequestSwitch={(pid, rect) => {
              // 无活跃进程时不弹断点卡直接切换（没有旧进程可留断点）
              if (!board.running) {
                void switchTo(pid);
                return;
              }
              setPendingSwitch({ pid, rect });
            }}
            onDragOverActive={setDragOverActive}
          />
        </>
      )}
      <NewProcessRow />

      {pendingSwitch && (
        <BreakpointCard
          oldTitle={runningTitle}
          rect={pendingSwitch.rect}
          onConfirm={(text) => {
            const pid = pendingSwitch.pid;
            setPendingSwitch(null);
            void switchTo(pid, text || undefined);
          }}
          onCancel={() => setPendingSwitch(null)}
        />
      )}
      {idlePrompt && (
        <IdleConfirmCard
          title={idlePrompt.title}
          onAnswer={(yes) => {
            const pid = idlePrompt.pid;
            setIdlePrompt(null);
            void answerIdleConfirm(pid, yes);
          }}
        />
      )}
    </div>
  );
}
