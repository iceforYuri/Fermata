import { useEffect, useRef, useState } from "react";
import HomePage from "./pages/HomePage";
import { RestPage } from "./pages/RestPage";
import PopupTriggerPage from "./pages/PopupTriggerPage";
import PocPopupPage from "./pages/PocPopupPage";
import { SwitcherPage } from "./pages/SwitcherPage";
import { RestpopPage } from "./pages/RestpopPage";
import { BoardPage } from "./pages/BoardPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { StatsPage } from "./pages/stats/StatsPage";
import { TitleBar } from "./components/TitleBar";
import { LibraryPanel } from "./components/LibraryPanel";
import { DetailPanel } from "./components/DetailPanel";
import { ArchiveOverlay } from "./components/ArchiveOverlay";
import { ImportConfirmDemo, ImportConfirmOverlay } from "./components/ImportConfirmOverlay";
import { UndoToast } from "./components/UndoToast";
import { useBoard } from "./store/board";
import { setUi, useUi } from "./store/ui";
import { useScheduler } from "./store/scheduler";

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const path = hash.replace(/^#/, "");
  return path === "" ? "/" : path;
}

/** 主应用壳：标题栏 + 三栏 + 浮层 + 调度 tick。休息态霸占 tab 1（版面在玻璃后面等着）。
 *  v1.3：主三页常驻挂载的横向轨道（transform 滑动）；离屏页 inert（pointer-events/visibility）。 */
function Shell() {
  const { tab, leftOpen } = useUi();
  const { rest } = useBoard();
  useScheduler();
  const centerRef = useRef<HTMLDivElement>(null);
  const [hintStyle, setHintStyle] = useState<React.CSSProperties | null>(null);

  // 稿库提示：rail 与中列左缘之间的空白带垂直居中；空白带 <140px 时隐藏
  useEffect(() => {
    const place = () => {
      const el = centerRef.current;
      if (!el) return;
      const inner = el.querySelector<HTMLElement>(".center-inner");
      if (!inner) return;
      const band = inner.getBoundingClientRect().left - 28; // rail 宽 28
      if (band < 140) {
        setHintStyle(null);
        return;
      }
      setHintStyle({ left: 28 + band / 2, top: "50%", transform: "translate(-50%, -50%)" });
    };
    place();
    window.addEventListener("resize", place);
    const t = setInterval(place, 800); // 面板推拉期间跟随
    return () => {
      window.removeEventListener("resize", place);
      clearInterval(t);
    };
  }, []);

  const idx = tab === "board" ? 0 : tab === "stats" ? 1 : 2;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <TitleBar />
      <div className="app-body">
        {/* 稿库 rail：只在进程页常驻 */}
        {tab === "board" && (
          <button
            className="lib-rail"
            data-testid="lib-rail"
            title={leftOpen ? "收起稿库" : "展开稿库"}
            onClick={() => setUi({ leftOpen: !leftOpen })}
          >
            <svg viewBox="0 0 10 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              {leftOpen ? <path d="M7 2 3 7l4 5" /> : <path d="M3 2l4 5-4 5" />}
            </svg>
          </button>
        )}
        {tab === "board" && !leftOpen && hintStyle && (
          <div className="lib-hint" data-testid="lib-hint" style={hintStyle}>
            <svg className="lib-hint-arrow" width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M15 7H3.5M7.5 1.5 2 7l5.5 5.5" />
            </svg>
            <div className="lib-hint-text">
              <div>稿库</div>
              <div className="lib-hint-sub">今日剩余与明日草稿</div>
            </div>
          </div>
        )}
        <LibraryPanel />
        <div
          ref={centerRef}
          className="center-col"
          onClickCapture={() => {
            if (leftOpen && tab === "board") setUi({ leftOpen: false }); // 点中列任意处收起
          }}
        >
          <div
            className="track"
            data-testid="track"
            style={{ transform: `translateX(-${idx * (100 / 3)}%)` }}
          >
            <div className={`track-page${idx === 0 ? " current" : ""}`} data-testid="track-page-board">
              <BoardPage />
              {rest.resting && <RestPage />}
            </div>
            <div className={`track-page${idx === 1 ? " current" : ""}`} data-testid="track-page-stats">
              <StatsPage />
            </div>
            <div className={`track-page${idx === 2 ? " current" : ""}`} data-testid="track-page-settings">
              <SettingsPage />
            </div>
          </div>
        </div>
        <DetailPanel />
      </div>
      <ArchiveOverlay />
      <ImportConfirmOverlay />
      <UndoToast />
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  switch (route) {
    case "/overlay/switcher":
      return <SwitcherPage />;
    case "/overlay/restpop":
      return <RestpopPage />;
    case "/overlay/poc-popup-trigger":
      return <PopupTriggerPage />;
    case "/overlay/poc-popup":
      return <PocPopupPage />;
    case "/overlay/import-confirm":
      return <ImportConfirmDemo />;
    case "/home":
      return <HomePage />;
    default:
      return <Shell />;
  }
}
