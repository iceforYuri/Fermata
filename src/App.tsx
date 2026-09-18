import { useEffect, useState } from "react";
import HomePage from "./pages/HomePage";
import { RestPage } from "./pages/RestPage";
import PopupTriggerPage from "./pages/PopupTriggerPage";
import PocPopupPage from "./pages/PocPopupPage";
import { BoardPage } from "./pages/BoardPage";
import { SettingsPage, StatsPage } from "./pages/Placeholders";
import { TitleBar } from "./components/TitleBar";
import { LibraryPanel } from "./components/LibraryPanel";
import { DetailPanel } from "./components/DetailPanel";
import { ArchiveOverlay } from "./components/ArchiveOverlay";
import { UndoToast } from "./components/UndoToast";
import { useBoard } from "./store/board";
import { useUi } from "./store/ui";

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

/** 主应用壳：标题栏 + 三栏 + 浮层。休息态霸占 tab 1（版面在玻璃后面等着）。 */
function Shell() {
  const { tab, resting, theme } = useUi();
  useBoard(); // 数据常驻
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const page =
    tab === "stats" ? <StatsPage /> : tab === "settings" ? <SettingsPage /> : <BoardPage />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <TitleBar />
      <div className="app-body">
        <LibraryPanel />
        <div className="center-col">
          <div
            key={tab}
            className="tab-page"
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "center",
              overflowY: "auto",
              position: "relative",
            }}
          >
            {page}
            {resting && tab === "board" && <RestPage />}
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
