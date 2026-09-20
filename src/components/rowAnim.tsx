import { useLayoutEffect, useRef, useState } from "react";

/** 行级增删动效（全 app 同一套语言，时长/曲线不新增）：
 *  完成 ✓ = 划线从左到右画出（STRIKE_MS）；删除/离场 = 沉降收起（高度→0 + 淡出，LEAVE_MS）；
 *  接纳 = 弹性开缝（ENTER_MS，与 dnd.SQUEEZE 同族弹簧）。 */

export const STRIKE_MS = 160; // 划线画出（ease-out）
export const LEAVE_MS = 200; // 沉降收起（ease-out）
export const ENTER_MS = 220; // 开缝接纳（弹簧，同 SQUEEZE）

/**
 * 行离场（点击触发型）：withStrike=true 先画划线（完成语义），再量高沉降；
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

/**
 * 行出（数据联动型，如「未做」区行被 ✓ 联动移除）：
 * 以缓存高度挂起幽灵行 → 下一帧沉降到 0 → 到点 onGone 卸载。
 */
export function LeavingRow({
  height,
  className,
  title,
  onGone,
}: {
  height: number;
  className: string;
  title: string;
  onGone: () => void;
}) {
  const [collapse, setCollapse] = useState(false);
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => setCollapse(true));
    const done = setTimeout(onGone, LEAVE_MS + 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      className={`${className} leaving-anim${collapse ? " collapsing" : ""}`}
      style={{ height: collapse ? 0 : height }}
      data-testid="dv-notdone-leaving"
    >
      {title}
    </div>
  );
}

/**
 * 行入（数据联动型，如 ↩ 回退联动进「未做」）：
 * 0 高挂载 → 量得自然高 → 弹簧撑开；播完恢复自适应高。
 */
export function EnteringRow({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0); // -1 = 播完恢复 auto
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = el.scrollHeight;
    const raf = requestAnimationFrame(() => setH(target));
    const done = setTimeout(() => setH(-1), ENTER_MS + 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, []);
  return (
    <div
      ref={ref}
      className={`${className} entering-anim`}
      style={h < 0 ? undefined : { height: h, opacity: h === 0 ? 0 : 1 }}
      data-testid="dv-notdone-entering"
    >
      {children}
    </div>
  );
}
