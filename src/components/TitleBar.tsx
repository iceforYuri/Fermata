import { memo } from "react";
import { system } from "../api/system";
import { setUi, useUi, type Tab } from "../store/ui";
import { useResting } from "../store/board";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  {
    key: "board",
    label: "进程",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2.5 8.5h11" />
        <rect x="3.5" y="3.5" width="6" height="2.4" />
        <rect x="6.5" y="10.2" width="6" height="2.4" />
      </svg>
    ),
  },
  {
    key: "stats",
    label: "统计",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="5.2" />
        <path d="M8 2.8A5.2 5.2 0 0 1 13.2 8" strokeWidth="2.4" />
      </svg>
    ),
  },
  {
    key: "settings",
    label: "设置",
    icon: (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M5 3.2 11.5 12.8M4.2 10.9l2.6 2.6M11.8 4.6l-1.7 1.7a2.2 2.2 0 0 1-3-3L5.4 1.6" />
        <circle cx="12" cy="4" r="1.6" />
      </svg>
    ),
  },
];

/** 休止符小符号（SVG 自绘：字体覆盖不稳） */
function RestMark() {
  return (
    <svg className="rest-mark" viewBox="0 0 10 12" data-testid="rest-mark">
      <path
        d="M2 1h6v3.2c0 1.5-1 2.4-2 2.9l2 3.9H2l2.2-4.1C3 6.4 2 5.4 2 4V1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 顶栏（v1.1）：拖拽区=两侧留白（不盖导航），居中胶囊导航 + 右上窗控。
 * memo + 窄选择器，1Hz tick 不重渲染（点击稳定性的根治之一）。
 */
export const TitleBar = memo(function TitleBar() {
  const { tab } = useUi();
  const resting = useResting();

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    // 先收起两侧面板（~140ms），再横滑切换（~220ms）；任何切页面板都收起进场
    setUi({ leftOpen: false, rightPid: null, archiveOpen: false });
    setTimeout(() => setUi({ tab: next }), 140);
  };

  return (
    <div className="titlebar">
      <div className="drag drag-side" data-tauri-drag-region />
      <nav className="capsule-nav" data-testid="capsule-nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`capsule-tab${tab === t.key ? " active" : ""}`}
            data-testid={`tab-${t.key}`}
            onClick={() => switchTab(t.key)}
          >
            <span className="capsule-icon">{t.icon}</span>
            <span className="capsule-label">{t.label}</span>
            {t.key === "board" && resting && tab !== "board" && <RestMark />}
            <span className="capsule-indicator" />
          </button>
        ))}
      </nav>
      <div className="drag drag-side" data-tauri-drag-region />
      <div className="win-controls">
        <button onClick={() => void system.winMinimize()} title="最小化" data-testid="win-min">
          <svg viewBox="0 0 10 10"><path d="M1 5h8" stroke="currentColor" strokeWidth="1.2" /></svg>
        </button>
        <button onClick={() => void system.winToggleMaximize()} title="最大化" data-testid="win-max">
          <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1">
            <rect x="1.5" y="1.5" width="7" height="7" />
          </svg>
        </button>
        <button className="close" onClick={() => void system.winClose()} title="关闭" data-testid="win-close">
          <svg viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
});
