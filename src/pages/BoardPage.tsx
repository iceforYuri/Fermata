import { useEffect } from "react";
import { data } from "../api/data";
import { system } from "../api/system";
import { act, refreshBoard, todayStr, useBoard } from "../store/board";
import { ActiveRow } from "../components/ActiveRow";
import { BoardHeader, DoneBar } from "../components/BoardHeader";
import { EmptyState } from "../components/EmptyState";
import { NewProcessRow } from "../components/NewProcessRow";
import { SuspendedQueue } from "../components/SuspendedRow";

/**
 * 进程页（Tab 1）：报头 → 已完栏 → 折线 → 活跃行 → 挂起队列 → + 号。
 * 休息态时整页被休息页取代（App 层处理）。
 */
export function BoardPage() {
  const { board } = useBoard();

  // 空闲接线：Rust 空闲线程事件 → 计时暂停/恢复 + 刷新
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    system
      .onIdleChange((idling) => {
        void (async () => {
          const b = await data.qBoard(todayStr());
          const pid = b.running?.process.id;
          if (pid) await (idling ? data.idleStart(pid) : data.idleEnd(pid));
          await refreshBoard();
        })();
      })
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  if (!board) return null;
  const day = board.day;
  const empty =
    !board.running && board.suspended.length === 0 && board.completed.length === 0;

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
          <SuspendedQueue rows={board.suspended} day={day} />
        </>
      )}
      <NewProcessRow />
    </div>
  );
}
