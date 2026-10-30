import { useState } from "react";
import { data, type BoardProcess } from "../api/data";
import { act, markHex, useBoard } from "../store/board";
import { completeWithUndo } from "../store/actions";
import { closeRowMenu, openDetail, openRowMenu } from "../store/ui";
import { agingInk, agingOpacity, fmtDur } from "../util";
import { lockFor, useLocks } from "../store/locks";
import { useEffect, useRef } from "react";
import { isMobile } from "../mobile";
import { ROW_PITCH, SQUEEZE, isOverActive, queueInsertAt } from "./dnd";

/**
 * 挂起行 64px：标题 15 / 导语小字（栈顶条目）/ 老化"挂 23m" /
 * 老化双轴：行线性渐褪（4h 触底 0.45）+"挂 xx"反向加深（4h 到顶浓墨，hover 复活不及它）；
 * 点击=断点小卡切换+详情栏同开；拖动=排序（先塌陷后开缝+落点虚影）；
 * 拖过折线到活跃位=切换（虚影覆盖活跃位）。
 */
export function SuspendedRow({
  bp,
  style,
  onDragStart,
  dragDy,
}: {
  bp: BoardProcess;
  style?: React.CSSProperties;
  onDragStart?: (e: React.PointerEvent, pid: number) => void;
  /** 拖拽跟手位移（移动端原位 transform，不克隆换 DOM——触摸序列会丢） */
  dragDy?: number;
}) {
  const board = useBoard();
  const p = bp.process;
  const lockInfo = lockFor(useLocks(), p.uuid);
  const color = markHex(board, p.color_tag);
  const waiting = p.state === "waiting_ai";
  // 老化双轴：行褪（--age-op，施于卡片边框/染底与标题等小字）+ 标签沉（--age-ink，只施于「挂 xx」）
  const ageOp = waiting ? 1 : agingOpacity(bp.aging_ms ?? 0);
  const ageInk = waiting ? 0.38 : agingInk(bp.aging_ms ?? 0);

  return (
    <div
      className={`row suspended${color ? "" : " no-mark"}${dragDy !== undefined ? " dragging" : ""}`}
      style={
        {
          "--mc": color ?? undefined, "--age-op": ageOp, "--age-ink": ageInk,
          ...(dragDy !== undefined ? { transform: `translateY(${dragDy}px)`, transition: "none" } : {}),
          ...style,
        } as React.CSSProperties
      }
      data-testid="suspended-row"
      data-pid={p.id}
      data-state={p.state}
      onPointerDown={(e) => { onDragStart?.(e, p.id); }}
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
          {lockInfo ? (
            <span className="lock-badge" data-testid="lock-badge">
              {lockInfo.fresh
                ? `在 ${lockInfo.lock.device_name} 运行中 · 始于 ${new Date(lockInfo.lock.started_at).toTimeString().slice(0, 5)}`
                : `可能仍在 ${lockInfo.lock.device_name} 运行中`}
            </span>
          ) : (
            <span className="aging-label">挂 {fmtDur(bp.aging_ms ?? 0)}</span>
          )}
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
  const [drag, setDrag] = useState<{ pid: number; dy: number; insertAt: number; overActive: boolean } | null>(null);

  const onRowPointerDown = (e: React.PointerEvent, pid: number) => {
    if (isMobile) return; // 移动端走 touch 事件流（pointer move 在 Android WebView 被滚动抢占）
    if ((e.target as HTMLElement).closest(".spine")) return;
    const startY = e.clientY;
    const startX = e.clientX;
    let cur = { pid, dy: 0, insertAt: 0, overActive: false };
    // 长按 500ms 不拖动 → 操作菜单（菜单开=本次手势不再走点击）
    let menuOpened = false;
    const lpTimer = window.setTimeout(() => {
      if (moved) return;
      menuOpened = true;
      openRowMenu({ pid, x: startX, y: startY, kind: "suspended" });
    }, 500);
    let moved = false;

    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY;
      if (!moved && Math.abs(dy) <= 4) return; // 4px 阈值
      moved = true;
      if (menuOpened) { closeRowMenu(); } // 长按后拖动：菜单合并进拖拽
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
      window.clearTimeout(lpTimer);
      if (!moved && !menuOpened) {
        const main = (ev.target as HTMLElement).closest("[data-pid-main]");
        // 点击：断点卡贴被点行下方（portal 到 body，fixed 坐标不被页面过渡的 transform 劫持）
        // + 右侧详情栏同步推出，钉在被点这件上（Enter 切换后详情不跳，它恰好变活跃）
        if (main) {
          openDetail(pid);
          onRequestSwitch(pid, main.getBoundingClientRect());
        }
        return;
      }
      if (cur.overActive) {
        // 拖到活跃位 = 切换；断点卡在原活跃行下展开（由 BoardPage 用活跃行 rect 承接）
        const activeEl = document.querySelector("[data-testid='active-row'] .row-main");
        cbRef.current.onRequestSwitch(pid, activeEl?.getBoundingClientRect() ?? new DOMRect(80, 200, 10, 10));
        return;
      }
      const ids = rows.map((r) => r.process.id).filter((id) => id !== pid);
      const next = [...ids.slice(0, cur.insertAt), pid, ...ids.slice(cur.insertAt)];
      void act(() => data.queueReorder(cbRef.current.day, next));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // 移动端触摸手势流：点按=详情+切换请求；长按 500ms=操作菜单；长按后拖=菜单合并进拖拽排序
  // （pointer 事件在 Android WebView 下 move 流会被滚动抢占，必须用 touch + preventDefault）
  const queueElRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const cbRef = useRef({ onRequestSwitch, onDragOverActive, day });
  cbRef.current = { onRequestSwitch, onDragOverActive, day };
  useEffect(() => {
    if (!isMobile) return;
    const el = queueElRef.current;
    if (!el) return;
    let pid = 0;
    let x0 = 0, y0 = 0;
    let lpTimer = 0;
    let menuOpen = false;
    let dragging = false;
    let cancelled = false;
    let cur = { pid: 0, dy: 0, insertAt: 0, overActive: false };
    const down = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".spine")) return;
      const main = target.closest("[data-pid-main]");
      if (!main) return;
      pid = Number(main.getAttribute("data-pid-main"));
      setDrag(null); // 残留兜底
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY;
      menuOpen = false; dragging = false; cancelled = false;
      lpTimer = window.setTimeout(() => {
        menuOpen = true;
        openRowMenu({ pid, x: x0, y: y0, kind: "suspended" });
        const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener("click", eat, { capture: true, once: true });
      }, 500);
    };
    const move = (e: TouchEvent) => {
      if (!pid) return;
      const t = e.touches[0];
      const dy = t.clientY - y0;
      const dx = t.clientX - x0;
      if (!menuOpen) {
        if (Math.abs(dy) > 4 || Math.abs(dx) > 4) {
          window.clearTimeout(lpTimer);
          cancelled = true; // 滚动/横滑意图，让浏览器接管
        }
        return;
      }
      e.preventDefault(); // 长按后拖动：按住浏览器滚动
      if (!dragging) {
        dragging = true;
        closeRowMenu(); // 菜单合并进拖拽
      }
      const activeEl = document.querySelector("[data-testid='active-row']");
      const qTop = el.getBoundingClientRect().top;
      const overActive = isOverActive(t.clientY, activeEl ? activeEl.getBoundingClientRect().bottom : null);
      const insertAt = queueInsertAt(t.clientY, qTop, rowsRef.current.length - 1);
      cur = { pid, dy, insertAt, overActive };
      setDrag({ ...cur });
      cbRef.current.onDragOverActive(overActive);
    };
    const up = () => {
      window.clearTimeout(lpTimer);
      if (!pid) return;
      if (dragging) {
        cbRef.current.onDragOverActive(false);
        setDrag(null);
        if (cur.overActive) {
          const activeEl = document.querySelector("[data-testid='active-row'] .row-main");
          cbRef.current.onRequestSwitch(cur.pid, activeEl?.getBoundingClientRect() ?? new DOMRect(80, 200, 10, 10));
        } else {
          const ids = rowsRef.current.map((r) => r.process.id).filter((id) => id !== cur.pid);
          const next = [...ids.slice(0, cur.insertAt), cur.pid, ...ids.slice(cur.insertAt)];
          void act(() => data.queueReorder(day, next));
        }
      } else if (!menuOpen && !cancelled) {
        // 点按：详情卡 + 切换请求（与桌面同路径，由 BoardPage 分流移动端语义）
        const main = document.querySelector(`[data-pid-main='${pid}']`);
        openDetail(pid);
        cbRef.current.onRequestSwitch(pid, main?.getBoundingClientRect() ?? new DOMRect(80, 200, 10, 10));
      }
      pid = 0; dragging = false; menuOpen = false;
    };
    // 行 DOM 在拖拽中会被「塌陷补位」重排替换，触点原生跟随起始节点——move/up 必须挂 window 才丢不了
    el.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.clearTimeout(lpTimer);
      el.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, []);

  // 统一插入预览：pointer 拖拽优先，其次稿库拖入；overActive 时队列不开缝
  const previewAt = drag && !drag.overActive ? drag.insertAt : !drag && libPreview ? libPreview.insertAt : null;
  const origIdxOf = (pid: number) => rows.findIndex((r) => r.process.id === pid);
  const dragOrigIdx = drag ? origIdxOf(drag.pid) : -1;
  // 塌陷空间下标：被拖行之后的行为 origIdx-1，其余为 origIdx
  const collapsedIdxOf = (origIdx: number) => (drag && origIdx > dragOrigIdx ? origIdx - 1 : origIdx);

  return (
    <div data-testid="suspended-queue" ref={queueElRef} style={{ position: "relative" }}>
      {rows.map((bp, origIdx) => {
        if (drag && bp.process.id === drag.pid) {
          // 被拖行：原位 transform 跟手（不克隆换 DOM——触摸序列锚定起始节点，换掉就丢手势）；
          // 原槽由后续行补位（下方行的 shift 逻辑不变）
          return (
            <div key={bp.process.id} style={{ position: "relative", zIndex: 5 }}>
              <SuspendedRow bp={bp} dragDy={drag.dy} />
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
