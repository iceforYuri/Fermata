import { memo, useEffect, useRef } from "react";
import { system } from "../api/system";
import { setUi, useUi, type Tab } from "../store/ui";
import { useResting } from "../store/board";

/* 弹簧参数：参照 docs/reference/navigation.md（response 0.42s, zeta 0.86） */
const OMEGA = (2 * Math.PI) / 0.42;
const K = OMEGA * OMEGA;
const C = 2 * 0.86 * OMEGA;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (x: number) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};

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
 * 顶栏（v1.2）：无边界 morph 导航——无容器底无分隔线；未选中=小图标，选中=弹簧 morph
 * 展开"图标+文字"（pill 染底极淡）。几何居中（窗口正中），命中区 ≥36px，项距用 padding。
 */
export const TitleBar = memo(function TitleBar() {
  const { tab } = useUi();
  const resting = useResting();
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const springs = useRef(TABS.map((t) => ({ p: t.key === "board" ? 1 : 0, v: 0, target: t.key === "board" ? 1 : 0 })));
  const raf = useRef(0);
  const lastT = useRef(0);

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setUi({ leftOpen: false, rightPid: null, archiveOpen: false });
    setTimeout(() => setUi({ tab: next }), 140);
  };

  // 弹簧渲染循环
  useEffect(() => {
    springs.current.forEach((s, i) => (s.target = TABS[i].key === tab ? 1 : 0));
    if (raf.current) return;
    const tick = (t: number) => {
      const dt = Math.min((lastT.current ? t - lastT.current : 16.7) / 1000, 0.032);
      lastT.current = t;
      let active = false;
      springs.current.forEach((s, i) => {
        if (s.p === s.target && s.v === 0) return;
        s.v += (-K * (s.p - s.target) - C * s.v) * dt;
        s.p += s.v * dt;
        if (Math.abs(s.p - s.target) < 0.001 && Math.abs(s.v) < 0.005) {
          s.p = s.target;
          s.v = 0;
        } else {
          active = true;
        }
        renderItem(i, s.p);
      });
      raf.current = active ? requestAnimationFrame(tick) : 0;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [tab]);

  function renderItem(i: number, pRaw: number) {
    const el = itemsRef.current[i];
    if (!el) return;
    const p = Math.max(-0.08, Math.min(1.12, pRaw));
    const t = Math.max(0, Math.min(1, pRaw));
    const pillW = parseFloat(el.dataset.pillW ?? "64");
    el.style.width = `${lerp(36, pillW, p)}px`;
    const pill = el.querySelector<HTMLElement>(".nav-pill");
    if (pill) {
      pill.style.setProperty("--pill-a", `${smooth(t / 0.4) * 100}%`);
    }
    const label = el.querySelector<HTMLElement>(".nav-label");
    if (label) {
      label.style.opacity = String(smooth((t - 0.5) / 0.45));
    }
  }

  return (
    <div className="titlebar borderless">
      <div className="drag drag-side" data-tauri-drag-region />
      <nav className="morph-nav" data-testid="capsule-nav">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            ref={(el) => {
              itemsRef.current[i] = el;
            }}
            className={`morph-tab${tab === t.key ? " active" : ""}`}
            data-testid={`tab-${t.key}`}
            data-pill-w={64 + t.label.length * 14}
            onClick={() => switchTab(t.key)}
          >
            <span className="nav-pill" />
            <span className="nav-icon">{t.icon}</span>
            <span className="nav-label" style={{ opacity: tab === t.key ? 1 : 0 }}>
              {t.label}
            </span>
            {t.key === "board" && resting && tab !== "board" && <RestMark />}
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
