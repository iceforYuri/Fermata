/** 行级增删动效（全 app 同一套语言，时长/曲线不新增）：
 *  完成 ✓ = 划线从左到右画出（STRIKE_MS）；删除/离场 = 沉降收起（高度→0 + 淡出，LEAVE_MS）；
 *  接纳 = 弹性开缝（CSS keyframes，与 dnd.SQUEEZE 同族弹簧）。 */

export const STRIKE_MS = 160; // 划线画出（ease-out）
export const LEAVE_MS = 200; // 沉降收起（ease-out）
export const ENTER_MS = 220; // 开缝接纳（弹簧，同 SQUEEZE）

/**
 * 行离场：withStrike=true 先画划线（完成语义），再量高沉降；
 * 动画走完才执行数据动作（让位/消失对观众可读）。
 */
export function animateRowLeave(
  rowEl: HTMLElement | null,
  action: () => void,
  withStrike = false,
) {
  if (!rowEl || rowEl.classList.contains("leaving")) {
    if (!rowEl) action();
    return;
  }
  if (withStrike) rowEl.classList.add("completing");
  const collapse = () => {
    rowEl.style.height = `${rowEl.offsetHeight}px`;
    void rowEl.offsetHeight; // reflow：固定起点再沉降
    rowEl.classList.add("leaving");
    requestAnimationFrame(() => {
      rowEl.style.height = "0px";
    });
  };
  if (withStrike) setTimeout(collapse, STRIKE_MS);
  else collapse();
  setTimeout(action, (withStrike ? STRIKE_MS : 0) + LEAVE_MS + 40);
}
