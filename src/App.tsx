import { useEffect, useState } from "react";
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

/** 主应用壳：标题栏 + 三栏 + 浮层 + 调度 tick。休息态霸占 tab 1（版面在玻璃后面等着）。 */
function Shell() {
  const { tab, leftOpen } = useUi();
  const { rest } = useBoard();
  useScheduler();

  const page =
    tab === "stats" ? <StatsPage /> : tab === "settings" ? <SettingsPage /> : <BoardPage />;

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
            {!leftOpen && <span className="rail-hint" data-testid="rail-hint">稿库</span>}
          </button>
        )}
        <LibraryPanel />
        <div
          className="center-col"
          onClickCapture={() => {
            if (leftOpen && tab === "board") setUi({ leftOpen: false }); // 点中列任意处收起
          }}
        >
          <div
            key={tab}
            className="tab-page"
            style={{
              flex: 1,
              overflowY: "auto",
              position: "relative",
            }}
          >
            {page}
            {rest.resting && tab === "board" && <RestPage />}
          </div>
        </div>
        <DetailPanel />
      </div>
      <ArchiveOverlay />
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
    case "/home":
      return <HomePage />;
    default:
      return <Shell />;
  }
}
