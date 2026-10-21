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
import { TABS } from "./TitleBar";
import { setUi, useUi, type Tab } from "../store/ui";
import { useBoard } from "../store/board";
import { invoke } from "@tauri-apps/api/core";
import { statsSwipe } from "../mobile-stats";
import { useScheduler } from "../store/scheduler";

const ORDER: Tab[] = ["board", "stats", "settings"];

/** 移动端壳（docs/07-移动端.md §6）：底部 morph 导航（无容器底、浮于版面）+ 页面条带横滑
 *  + 稿库左抽屉（顶栏字形按钮 / 左缘右滑）+ 详情底卡（自下而上，点空白退出）。
 *  动效与桌面同源：弹簧 response 0.42s / zeta 0.86 的 settle 近似 cubic-bezier(.2,.9,.25,1)。 */
export function MobileShell() {
  const { tab, leftOpen, rightPid } = useUi();
  const { rest } = useBoard();
  useScheduler();
  const idx = ORDER.indexOf(tab);
  const stripRef = useRef<HTMLDivElement>(null);
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
    let x0 = 0, y0 = 0, mode = "" as "" | "h" | "v";
    const down = (e: TouchEvent) => {
      const t = e.touches[0];
      x0 = t.clientX; y0 = t.clientY; mode = "";
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      const ddx = t.clientX - x0;
      const ddy = t.clientY - y0;
      if (mode === "" && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) mode = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
      if (mode !== "h") return;
      e.preventDefault();
      const i = idxRef.current;
      const atEdge = (i === 0 && ddx > 0) || (i === ORDER.length - 1 && ddx < 0);
      dragRef.current = ddx;
      setDragX(atEdge ? ddx / 3 : ddx);
    };
    const up = () => {
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
      <div className={"m-scrim" + (leftOpen ? " open" : "")} onPointerDown={() => setUi({ leftOpen: false })} />
      <div className={"m-lib-drawer" + (leftOpen ? " open" : "")}>
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

      {/* PoC 门 4 临时入口（M4m 同步落地后移除） */}
      <button
        className="m-poc-webdav"
        aria-label="WebDAV 环回测试"
        onClick={async () => {
          try {
            const r = await invoke("webdav_probe", { url: "http://10.0.2.2:8877/fermata-poc.txt" });
            console.error("[webdav-poc] OK " + JSON.stringify(r));
          } catch (e) {
            console.error("[webdav-poc] FAIL " + String(e));
          }
        }}
      >
        ↻
      </button>

      <ArchiveOverlay />
      <ImportConfirmOverlay />
      <UndoToast />
    </div>
  );
}
