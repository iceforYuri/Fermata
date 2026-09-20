/** 拖放共享几何：进程行 pointer 拖拽与稿库 HTML5 拖入共用一套"先塌陷后开缝"模型。
 *  纯 transform 编舞：每行的目标位 = 塌陷位 +（目标位 >= 插入位 ? 1 : 0），
 *  被拖行的原槽由后续行补位，插入位撑开一道缝留给虚影。 */

export const ROW_PITCH = 74; // 64px 行高 + 10px 间距（--h-suspended + --row-gap）

/** 弹簧挤位（transform-only，沿用 tokens 的弹性曲线） */
export const SQUEEZE = "transform 220ms cubic-bezier(0.34, 1.36, 0.64, 1)";

/** 光标 y → 插入位（0..slotCount，塌陷空间），以队列容器顶为原点、行中点为分界 */
export function queueInsertAt(clientY: number, queueTop: number, slotCount: number): number {
  return Math.max(0, Math.min(slotCount, Math.round((clientY - queueTop) / ROW_PITCH)));
}

/** 推过折线（活跃行底缘 8px 滞回）= 活跃位 */
export function isOverActive(clientY: number, activeBottom: number | null): boolean {
  return activeBottom !== null && clientY < activeBottom - 8;
}
