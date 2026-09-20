import { memo, useEffect, useRef } from "react";
import { system } from "../api/system";
import { getUi, setUi, useUi, type Tab } from "../store/ui";
import { useResting } from "../store/board";

/* 弹簧参数：response 0.42s, zeta 0.86（原参考组件文档已因版权移除） */
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
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
        <path d="M3 15h18" />
      </svg>
    ),
  },
  {
    key: "stats",
    label: "统计",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z" />
        <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      </svg>
    ),
  },
  {
    key: "settings",
    label: "设置",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
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
    const { leftOpen, rightPid, archiveOpen } = getUi();
    if (leftOpen || rightPid !== null || archiveOpen) {
      // 面板开着：先收（140ms）再滑
      setUi({ leftOpen: false, rightPid: null, archiveOpen: false });
      setTimeout(() => setUi({ tab: next }), 140);
    } else {
      setUi({ tab: next }); // 无面板：立即切
    }
  };

  // 弹簧渲染循环（常驻单循环 + ref 读最新 tab；label 透明度只由弹簧写，React 不插手）
  const tabRef = useRef(tab);
  tabRef.current = tab;

  const renderItem = (i: number, pRaw: number) => {
    const el = itemsRef.current[i];
    if (!el) return;
    const p = Math.max(-0.08, Math.min(1.12, pRaw));
    const t = Math.max(0, Math.min(1, pRaw));
    const pillW = parseFloat(el.dataset.pillW ?? "64");
    const isActive = TABS[i].key === tabRef.current;
    el.style.width = `${lerp(36, pillW, p)}px`;
    const pill = el.querySelector<HTMLElement>(".nav-pill");
    if (pill) {
      const s0 = springs.current[i];
      if (isActive || s0.p !== s0.target || s0.v !== 0) {
        // 选中项/弹簧进行中：pill 染底封顶 ~10%（浅灰 pill + 深字）
        pill.style.setProperty("--pill-a", `${smooth(t / 0.4) * 10}%`);
      } else {
        // 未选中且静止：清内联，hover 交还 CSS
        pill.style.removeProperty("--pill-a");
      }
    }
    const label = el.querySelector<HTMLElement>(".nav-label");
    if (label) {
      label.style.opacity = String(smooth((t - 0.5) / 0.45));
    }
  };
  const renderRef = useRef(renderItem);
  renderRef.current = renderItem;

  useEffect(() => {
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
        renderRef.current(i, s.p);
      });
      // 收敛即停：raf 归零；下次 tab 变化由下方 effect 重启
      raf.current = active ? requestAnimationFrame(tick) : 0;
    };
    // tab 变化：重定目标并确保循环在转（无清理竞态——卸载才取消，且取消即归零）
    springs.current.forEach((s, i) => (s.target = TABS[i].key === tabRef.current ? 1 : 0));
    // 首帧立即按当前进度铺形态：初始即收敛时循环根本不会跑，不铺则按钮停在 auto 宽度（全部摊开）
    springs.current.forEach((s, i) => renderRef.current(i, s.p));
    if (!raf.current) raf.current = requestAnimationFrame(tick);
  }, [tab]);

  // 卸载清理：取消且归零（关键：不归零会让残留 id 骗过重启检查，弹簧永久死亡）
  useEffect(() => {
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, []);

  return (
    <div className="titlebar borderless">
      <div className="drag drag-side" data-tauri-drag-region />
      <nav className="morph-nav" data-testid="capsule-nav">
        {TABS.map((t, i) => (
          <span className="morph-slot" key={t.key}>
            <button
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
              <span className="nav-label">{t.label}</span>
              {t.key === "board" && resting && tab !== "board" && <RestMark />}
            </button>
          </span>
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
