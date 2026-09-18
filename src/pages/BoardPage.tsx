import { useEffect, useState } from "react";
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

/**
 * 进程页（Tab 1）：报头 → 已完栏 → 折线 → 活跃行 → 挂起队列 → + 号。
 * 休息态时整页被休息页取代（App 层处理）。
 */
export function BoardPage() {
  const { board } = useBoard();
  const [pendingSwitch, setPendingSwitch] = useState<{ pid: number; rect: DOMRect } | null>(null);
  const [idlePrompt, setIdlePrompt] = useState<{ pid: number; title: string } | null>(null);

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

  return (
    <div className="center-inner" data-testid="board-page">
      <BoardHeader />
      <DoneBar />
      <hr className="foldline" />
      {empty ? (
        <EmptyState />
      ) : (
        <>
          {board.running && <ActiveRow bp={board.running} />}
          {/* 折线位置落点：稿库拖到此处 = 直接激活 */}
          <div
            data-testid="fold-drop"
            style={{ height: 4, margin: "2px 0" }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("text/gika-plan")) e.preventDefault();
            }}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData("text/gika-plan");
              if (!raw) return;
              e.stopPropagation();
              const plan = JSON.parse(raw) as { id: number; title: string };
              void act(async () => {
                const pid = await data.processCreate(plan.title, undefined, day);
                await data.planDelete(plan.id);
                await data.processSwitch(pid);
              });
            }}
          />
          <SuspendedQueue
            rows={board.suspended}
            day={day}
            onRequestSwitch={(pid, rect) => setPendingSwitch({ pid, rect })}
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
