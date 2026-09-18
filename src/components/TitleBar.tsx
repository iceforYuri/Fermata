import { system } from "../api/system";
import { setUi, toggleLeft, useUi, type Tab } from "../store/ui";
import { useBoard } from "../store/board";

const TABS: { key: Tab; label: string }[] = [
  { key: "board", label: "进程" },
  { key: "stats", label: "统计" },
  { key: "settings", label: "设置" },
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

/** 自绘标题栏：三 tab（固定空间位置）+ 拖拽区 + 窗口控制 */
export function TitleBar() {
  const { tab } = useUi();
  const { rest } = useBoard();
  const resting = rest.resting;
  return (
    <div className="titlebar">
      <div className="drag" data-tauri-drag-region />
      <button
        className="tab"
        style={{ marginRight: 8 }}
        data-testid="lib-toggle"
        onClick={toggleLeft}
        title="稿库"
      >
        稿库
      </button>
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab${tab === t.key ? " active" : ""}`}
            data-testid={`tab-${t.key}`}
            onClick={() => setUi({ tab: t.key })}
          >
            {t.label}
            {t.key === "board" && resting && tab !== "board" && <RestMark />}
          </button>
        ))}
      </div>
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
}
