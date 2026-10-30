/** 长按菜单（移动端，docs/07-移动端.md §6 手势全集）：实心暖卡，点空白处关。
 *  挂起进程行：完成 / 查看详情；稿库计划条：排入今天 / 直接开始 / 删除。 */
import { data } from "../api/data";
import { act, todayStr, useBoard } from "../store/board";
import { closeRowMenu, openDetail, useUi } from "../store/ui";
import { completeWithUndo, switchTo } from "../store/actions";

export function RowMenu() {
  const { rowMenu } = useUi();
  const board = useBoard();
  if (!rowMenu) return null;
  const { pid, x, y, kind } = rowMenu;

  const plans = board.plans ?? [];
  const plan = kind === "plan" ? plans.find((p) => p.id === pid) : null;
  const bp = kind === "suspended"
    ? [...(board.board?.suspended ?? []), ...(board.board?.completed ?? []), ...(board.board?.running ? [board.board.running] : [])].find((r) => r.process.id === pid) ?? null
    : null;

  const vw = window.innerWidth;
  const left = Math.max(8, Math.min(x - 90, vw - 196));
  const top = Math.max(8, y - 8);

  // 排入：计划 → 今日版面挂起进程（等价桌面拖入队尾），返回新进程 pid
  const placePlan = async (): Promise<number> => {
    const newPid = await data.processCreate(plan!.title, undefined, todayStr());
    await data.planDelete(plan!.id);
    return newPid;
  };

  return (
    <>
      <div className="m-rowmenu-scrim" onPointerDown={closeRowMenu} />
      <div className="m-rowmenu" style={{ left, top }} role="menu">
        {kind === "suspended" && bp && (
          <>
            <button className="m-rowmenu-item" onClick={() => { closeRowMenu(); void completeWithUndo(bp); }}>
              完成
            </button>
            <button className="m-rowmenu-item" onClick={() => { closeRowMenu(); openDetail(pid); }}>
              查看详情
            </button>
            <button
              className="m-rowmenu-item"
              onClick={() => { closeRowMenu(); void moveRow(pid, -1); }}
            >
              上移
            </button>
            <button
              className="m-rowmenu-item"
              onClick={() => { closeRowMenu(); void moveRow(pid, 1); }}
            >
              下移
            </button>
          </>
        )}
        {kind === "plan" && plan && (
          <>
            <button
              className="m-rowmenu-item"
              onClick={() => { closeRowMenu(); void act(placePlan); }}
            >
              排入今天
            </button>
            <button
              className="m-rowmenu-item"
              onClick={() => {
                closeRowMenu();
                void (async () => {
                  const newPid = await placePlan();
                  // 直接开始：无活跃进程 → 立即切换；有 → 开详情卡，由卡内 ⤒ 完成断点确认
                  if (board.board?.running) {
                    openDetail(newPid);
                  } else {
                    await switchTo(newPid);
                  }
                })();
              }}
            >
              直接开始
            </button>
            <button
              className="m-rowmenu-item danger"
              onClick={() => { closeRowMenu(); void act(() => data.planDelete(plan.id)); }}
            >
              删除
            </button>
          </>
        )}
      </div>
    </>
  );
}


/** 挂起队列相邻换位（移动端排序兜底；触摸拖拽排序的 pointer 流在 WebView 下不稳，留打磨项） */
function moveRow(pid: number, dir: -1 | 1) {
  return act(async () => {
    const b = await data.qBoard(todayStr());
    const ids = b.suspended.map((r) => r.process.id);
    const i = ids.indexOf(pid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await data.queueReorder(todayStr(), ids);
  });
}
