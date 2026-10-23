import { useEffect, useRef, useState } from "react";
import { BoardPage } from "../pages/BoardPage";
import { RestPage } from "../pages/RestPage";
import { StatsPage } from "../pages/stats/StatsPage";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { LibraryPanel } from "./LibraryPanel";
import { DetailPanel } from "./DetailPanel";
import { ArchiveOverlay } from "./ArchiveOverlay";
import { ImportConfirmOverlay } from "./ImportConfirmOverlay";
import { UndoToast } from "./UndoToast";
import { RowMenu } from "./RowMenu";
import { TABS } from "./TitleBar";
import { setUi, useUi, getUi, type Tab } from "../store/ui";
import { act, getBoard, useBoard } from "../store/board";
import { statsSwipe } from "../mobile-stats";
import { keeper } from "../api/keeper";
import { isMobile } from "../mobile";
import { data } from "../api/data";
import { useScheduler } from "../store/scheduler";

const ORDER: Tab[] = ["board", "stats", "settings"];

/** 移动端壳（docs/07-移动端.md §6）：底部 morph 导航（无容器底、浮于版面）+ 页面条带横滑
 *  + 稿库左抽屉（顶栏字形按钮 / 左缘右滑）+ 详情底卡（自下而上，点空白退出）。
 *  动效与桌面同源：弹簧 response 0.42s / zeta 0.86 的 settle 近似 cubic-bezier(.2,.9,.25,1)。 */
export function MobileShell() {
  const { tab, leftOpen, rightPid } = useUi();
  const { rest } = useBoard();
  useScheduler();

  // M2m：会话通知由真实计时驱动（Q13）——运行/暂停/休息三态 + 进程名 + Chronometer；去抖：仅关键字段变化才发
  const { board, settings } = useBoard();
  const lastSent = useRef("");
  const lastReminderKey = useRef("");
  useEffect(() => {
    if (!isMobile) return;
    const running = board?.running ?? null;
    if (rest.resting) {
      if (lastSent.current !== "rest") { keeper.update({ title: "休息中", running: false, whenEpoch: 0, accumMs: 0 }); lastSent.current = "rest"; }
      keeper.cancelReminder();
      lastReminderKey.current = "";
      return;
    }
    if (!running) {
      if (lastSent.current !== "none") { keeper.hide(); keeper.cancelReminder(); lastSent.current = "none"; lastReminderKey.current = ""; }
      return;
    }
    const paused = !running.timer_open;
    const key = running.process.id + "|" + paused;
    if (lastSent.current !== key) {
      const whenEpoch = Date.now() - running.ring_elapsed_ms;
      keeper.update({ title: running.process.title, running: !paused, whenEpoch, accumMs: running.day_total_ms });
      lastSent.current = key;
    }
    // 休止符到点闹钟：仅 开始/恢复/暂停/切换 时排或撤；闹钟到点=到点提醒一次（Q12）
    const sliceMs = (parseInt(settings.slice_minutes ?? "45", 10) || 45) * 60_000;
    if (paused) {
      if (lastReminderKey.current !== "") { keeper.cancelReminder(); lastReminderKey.current = ""; }
    } else {
      const rKey = key; // 仅 进程+暂停态 变化才重排（绝对到点在排的那一刻算定）
      if (lastReminderKey.current !== rKey) {
        keeper.scheduleReminder(sliceMs - running.ring_elapsed_ms);
        lastReminderKey.current = rKey;
      }
    }
  }, [board, rest.resting]);

  // 通知按钮 → 真实暂停/继续（Q13：通知「继续」算显式恢复）
  useEffect(() => {
    if (!isMobile) return;
    let off: (() => void) | undefined;
    void keeper.onAction(async (action) => {
      const b = getBoard();
      const running = b.board?.running;
      if (!running) return;
      if (action === "pause") await act(() => data.processPause(running.process.id));
      else await act(() => data.processResume(running.process.id));
    }).then((f) => { off = f; });
    return () => { off?.(); };
  }, []);
  const idx = ORDER.indexOf(tab);
  const stripRef = useRef<HTMLDivElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const libScrimRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [settling, setSettling] = useState(false);
  const sheetDyRef = useRef(0);


  // 原生触摸手势（pointer 事件在 Android WebView 下 move 流被压缩，touch 事件流可靠）
  const idxRef = useRef(idx);
  idxRef.current = idx;
  const dragRef = useRef(0);
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    let x0 = 0, y0 = 0, mode = "" as "" | "h" | "v" | "drawer";
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; mode = "";
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      const ddx = t.clientX - x0;
      const ddy = t.clientY - y0;
      if (mode === "") {
        if (Math.abs(ddx) <= 8 && Math.abs(ddy) <= 8) return;
        mode = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
        // 进程页右滑 = 拉开稿库抽屉（任意位置；进程页是条带最左端，右滑无处可去，docs/07 §6）
        const ui = getUi();
        if (mode === "h" && ddx > 0 && idxRef.current === 0 && !ui.leftOpen && ui.rightPid == null) mode = "drawer";
      }
      if (mode === "drawer") {
        e.preventDefault();
        const w = drawerRef.current?.offsetWidth ?? 300;
        const dx = Math.max(0, ddx);
        dragRef.current = dx;
        const dr = drawerRef.current;
        if (dr) { dr.style.transition = "none"; dr.style.transform = `translateX(${Math.min(0, dx - w)}px)`; }
        const sc = libScrimRef.current;
        if (sc) { sc.style.transition = "none"; sc.style.opacity = String(Math.min(1, dx / w)); }
        return;
      }
      if (mode !== "h") return;
      e.preventDefault();
      const i = idxRef.current;
      const atEdge = (i === 0 && ddx > 0) || (i === ORDER.length - 1 && ddx < 0);
      // 统计页：横滑多数被内嵌视角吃掉，条带只给阻力暗示，避免大幅滑出又弹回
      const resist = ORDER[i] === "stats";
      dragRef.current = ddx;
      setDragX(atEdge || resist ? ddx / 3 : ddx);
    };
    const up = () => {
      if (mode === "drawer") {
        const dx = dragRef.current;
        const dr = drawerRef.current;
        if (dr) { dr.style.transition = ""; dr.style.transform = ""; }
        const sc = libScrimRef.current;
        if (sc) { sc.style.transition = ""; sc.style.opacity = ""; }
        if (dx > 64) setUi({ leftOpen: true });
        dragRef.current = 0;
        mode = "";
        return;
      }
      if (mode === "h") {
        const dx = dragRef.current;
        const i = idxRef.current;
        let target = i;
        // 统计页：横滑先切内嵌视角（年｜月｜日），到界才换页
        if (ORDER[i] === "stats" && Math.abs(dx) > 48) {
          const consumed = statsSwipe.current?.(dx < 0 ? 1 : -1) ?? false;
          if (consumed) {
            setSettling(true);
            setDragX(0);
            window.setTimeout(() => setSettling(false), 340);
            mode = "";
            return;
          }
        }
        if (dx < -48) target = Math.min(i + 1, ORDER.length - 1);
        else if (dx > 48) target = Math.max(i - 1, 0);
        setSettling(true);
        setDragX(0);
        if (target !== i) setUi({ tab: ORDER[target] });
        window.setTimeout(() => setSettling(false), 340);
      }
      mode = "";
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);

  return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
    };
  }, []);

  // 稿库抽屉：向左拖回关闭（1:1 跟手 + 64px 阈值归位，与横滑切页同一套语言）
  useEffect(() => {
    const el = drawerRef.current;
    if (!el || !leftOpen) return;
    let x0 = 0, y0 = 0, mode = "" as "" | "h" | "v";
    let dxCur = 0;
    let t0 = 0;
    const down = (e: TouchEvent) => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; mode = ""; t0 = Date.now(); };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      const ddx = t.clientX - x0;
      const ddy = t.clientY - y0;
      if (mode === "" && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) mode = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
      if (mode !== "h" || ddx >= 0) return;
      e.preventDefault();
      dxCur = ddx;
      const w = el.offsetWidth;
      el.style.transition = "none";
      el.style.transform = `translateX(${ddx}px)`;
      const sc = libScrimRef.current;
      if (sc) { sc.style.transition = "none"; sc.style.opacity = String(Math.max(0, 1 + ddx / w)); }
    };
    const up = () => {
      if (mode === "h" && dxCur < 0) {
        el.style.transition = ""; el.style.transform = "";
        const sc = libScrimRef.current;
        if (sc) { sc.style.transition = ""; sc.style.opacity = ""; }
        // 慢拖过 64px，或 300ms 内左甩 20px+（快滑手势），都关
        if (dxCur < -64 || (dxCur < -20 && Date.now() - t0 < 300)) setUi({ leftOpen: false });
      }
      mode = ""; dxCur = 0;
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up);
    el.addEventListener("touchcancel", up);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up);
      el.removeEventListener("touchcancel", up);
    };
  }, [leftOpen]);

    // 详情底卡：下滑关闭（内容滚到顶后 overscroll 下拉）
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetDrag = useRef({ y0: 0, active: false });
  const [sheetDy, setSheetDy] = useState(0);
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || rightPid == null) return;
    const inner = el.querySelector(".detail-inner");
    let y0 = 0;
    let pulling = false;
    const down = (e: TouchEvent) => { y0 = e.touches[0].clientY; pulling = false; };
    const move = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - y0;
      if (!pulling && dy > 0 && (inner?.scrollTop ?? 0) <= 0) pulling = true;
      if (!pulling) return;
      e.preventDefault();
      sheetDyRef.current = Math.max(0, dy); setSheetDy(Math.max(0, dy));
    };
    const up = () => {
      if (pulling && sheetDrag.current) {
        if (sheetDyRef.current > 90) { setUi({ rightPid: null }); }
      }
      pulling = false;
      setSheetDy(0);
    };
    el.addEventListener("touchstart", down, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", up);
    return () => {
      el.removeEventListener("touchstart", down);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", up);
    };
  }, [rightPid]);

  return (
    <div className="m-shell">
      {/* 稿库左抽屉 */}
      <div ref={libScrimRef} className={"m-scrim" + (leftOpen ? " open" : "")} onPointerDown={() => setUi({ leftOpen: false })} />
      <div ref={drawerRef} className={"m-lib-drawer" + (leftOpen ? " open" : "")}>
        <LibraryPanel />
      </div>

      {/* 页面条带：1:1 跟手 + 松手归位 */}
      <div
        className="m-strip"
        ref={stripRef}
      >
        <div
          className={"m-track" + (settling ? " settling" : "")}
          style={{ transform: `translateX(calc(${-idx * (100 / 3)}% + ${dragX}px))` }}
        >
          <div className="m-page">
            <BoardPage />
            {rest.resting && <RestPage />}
          </div>
          <div className="m-page">
            <StatsPage />
          </div>
          <div className="m-page">
            <SettingsPage />
          </div>
        </div>
      </div>

      {/* 稿库入口：进程页左上角字形按钮 */}
      {tab === "board" && !leftOpen && (
        <button className="m-lib-btn" aria-label="稿库" onClick={() => setUi({ leftOpen: true })}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M4 6h14" />
            <path d="M4 12h14" />
            <path d="M4 18h8" />
          </svg>
        </button>
      )}

      {/* 详情底卡 */}
      <div className={"m-scrim" + (rightPid != null ? " open" : "")} onPointerDown={() => setUi({ rightPid: null })} />
      <div
        ref={sheetRef}
        className={"m-detail-sheet" + (rightPid != null ? " open" : "")}
        style={sheetDy > 0 ? { transform: `translateY(${sheetDy}px)`, transition: "none" } : undefined}
      >
        <DetailPanel />
      </div>

      {/* 底部 morph 导航 */}
      <nav className="m-bottombar">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} className={"m-tab" + (active ? " active" : "")} onClick={() => setUi({ tab: t.key })}>
              <span className="m-tab-icon">{t.icon}</span>
              <span className="m-tab-label">{t.label}</span>
            </button>
          );
        })}
      </nav>

            <ArchiveOverlay />
      <ImportConfirmOverlay />
      <RowMenu />
      <UndoToast />
    </div>
  );
}
