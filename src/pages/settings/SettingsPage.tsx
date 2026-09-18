import { useEffect, useRef, useState } from "react";
import { data } from "../../api/data";
import { system } from "../../api/system";
import { act, useBoard } from "../../store/board";

/* ---------- 双态控件族（排版文字 → 原地变形；1px 下划线唯一编辑指示） ---------- */

function RowShell({
  label,
  value,
  editing,
  onEnter,
  children,
  testid,
}: {
  label: string;
  value: string;
  editing: boolean;
  onEnter: () => void;
  children?: React.ReactNode;
  testid: string;
}) {
  return (
    <div className="set-row" data-testid={testid}>
      <span className="set-label">{label}</span>
      {editing ? (
        <span className="set-editing">{children}</span>
      ) : (
        <span className="set-value" data-testid={`${testid}-value`} onClick={onEnter}>
          {value}
        </span>
      )}
    </div>
  );
}

/** 数字 stepper（分钟类设置） */
function NumRow({
  label,
  unit,
  value,
  min,
  max,
  step,
  onCommit,
  testid,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  testid: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (v: number) => {
    setEditing(false);
    const n = Math.max(min, Math.min(max, Math.round(v)));
    if (n !== value) onCommit(n);
  };
  return (
    <RowShell
      label={label}
      value={`${value} ${unit}`}
      editing={editing}
      onEnter={() => {
        setDraft(value); // 进入编辑态时草稿归位（上次 Esc 的残留不带入）
        setEditing(true);
      }}
      testid={testid}
    >
      <button className="stepper-btn" data-testid={`${testid}-minus`} onClick={() => setDraft((d) => Math.max(min, d - step))}>−</button>
      <input
        className="inline-edit set-num num"
        data-testid={`${testid}-input`}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(Number(e.target.value) || 0)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(draft);
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <button className="stepper-btn" data-testid={`${testid}-plus`} onClick={() => setDraft((d) => Math.min(max, d + step))}>+</button>
      <span className="set-unit">{unit}</span>
    </RowShell>
  );
}

/** 行内分段选择（不弹层） */
function ChoiceRow({
  label,
  value,
  options,
  onCommit,
  testid,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onCommit: (v: string) => void;
  testid: string;
}) {
  const [editing, setEditing] = useState(false);
  const current = options.find(([k]) => k === value)?.[1] ?? value;
  return (
    <RowShell label={label} value={current} editing={editing} onEnter={() => setEditing(true)} testid={testid}>
      {options.map(([k, label2]) => (
        <button
          key={k}
          className={`choice-chip${k === value ? " active" : ""}`}
          data-testid={`${testid}-opt-${k}`}
          onClick={() => {
            onCommit(k);
            setEditing(false);
          }}
        >
          {label2}
        </button>
      ))}
      <button className="choice-cancel" data-testid={`${testid}-esc`} onClick={() => setEditing(false)}>
        Esc
      </button>
    </RowShell>
  );
}

/** 开关（点击即切，无需变形） */
function ToggleRow({
  label,
  value,
  onFlip,
  testid,
}: {
  label: string;
  value: boolean;
  onFlip: (v: boolean) => void;
  testid: string;
}) {
  return (
    <div className="set-row" data-testid={testid}>
      <span className="set-label">{label}</span>
      <button
        className={`set-toggle${value ? " on" : ""}`}
        data-testid={`${testid}-toggle`}
        onClick={() => onFlip(!value)}
      >
        {value ? "开" : "关"}
      </button>
    </div>
  );
}

/** 热键捕获 */
function HotkeyRow({ value, onCommit, testid }: { value: string; onCommit: (v: string) => Promise<boolean>; testid: string }) {
  const [capturing, setCapturing] = useState(false);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!capturing) return;
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setCapturing(false);
        return;
      }
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
      const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
      if (mods.length === 0) return; // 至少要一个修饰键
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      const combo = [...mods, key].join("+");
      const okTo = await onCommit(combo);
      if (!okTo) setErr(true);
      setCapturing(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing, onCommit]);
  return (
    <RowShell
      label="切换浮层热键"
      value={err ? "注册失败，已回滚" : value}
      editing={capturing}
      onEnter={() => {
        setErr(false);
        setCapturing(true);
      }}
      testid={testid}
    >
      <span className="set-capture" data-testid={`${testid}-capturing`}>按下新快捷键…（Esc 取消）</span>
    </RowShell>
  );
}

/* ---------- 设置页 ---------- */

const SECTIONS: [string, string][] = [
  ["slice", "时间片与提醒"],
  ["timing", "计时"],
  ["appearance", "外观与排版"],
  ["hotkey", "快捷键"],
  ["data", "数据"],
];

export function SettingsPage() {
  const { settings, palette } = useBoard();
  const [activeSec, setActiveSec] = useState("slice");
  const [exported, setExported] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const get = (k: string, dflt: string) => settings[k] ?? dflt;
  const setNum = (k: string) => (v: number) => void act(() => data.settingSet(k, String(v)));
  const setStr = (k: string) => (v: string) => void act(() => data.settingSet(k, v));

  // scroll-spy：IntersectionObserver 高亮当前组
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActiveSec(e.target.getAttribute("data-sec")!);
        }
      },
      { root: root.closest(".tab-page"), threshold: 0.2 },
    );
    root.querySelectorAll("[data-sec]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    rootRef.current
      ?.querySelector(`[data-sec="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const hotkeyCommit = async (combo: string) => {
    const old = get("hotkey", "Alt+Q");
    await act(() => data.settingSet("hotkey", combo));
    try {
      await system.hotkeyApply();
      return true;
    } catch {
      await act(() => data.settingSet("hotkey", old)); // 失败回滚
      return false;
    }
  };

  const themeNow = get("theme", "light");
  const pal = themeNow === "dark" ? palette.dark : palette.light;

  return (
    <div className="settings-page" ref={rootRef} data-testid="settings-page">
      <div className="chips-nav" data-testid="chips-nav">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            className={`capsule-seg${activeSec === id ? " active" : ""}`}
            data-testid={`chip-${id}`}
            onClick={() => scrollTo(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <section data-sec="slice" className="set-sec">
        <div className="detail-label">时间片与提醒</div>
        <NumRow label="时间片长度" unit="分钟" value={parseInt(get("slice_minutes", "45"))} min={5} max={180} step={5} onCommit={setNum("slice_minutes")} testid="set-slice" />
        <NumRow label="连续工作阈值" unit="分钟" value={parseInt(get("continuous_limit_minutes", "90"))} min={15} max={360} step={15} onCommit={setNum("continuous_limit_minutes")} testid="set-cont" />
        <ChoiceRow label="休止符模式" value={get("rest_mode", "soft")} options={[["soft", "软（自然间隙才弹）"], ["hard", "硬（到点立即弹）"]]} onCommit={setStr("rest_mode")} testid="set-restmode" />
        <div className="set-row">
          <span className="set-label">提醒样式</span>
          <span className="set-value" style={{ cursor: "default" }}>
            应用内弹窗（无边框·置顶·不抢焦点；Windows 系统通知为兜底）
          </span>
        </div>
      </section>

      <section data-sec="timing" className="set-sec">
        <div className="detail-label">计时</div>
        <NumRow label="空闲检测阈值" unit="分钟" value={parseInt(get("idle_threshold_minutes", "5"))} min={1} max={60} step={1} onCommit={setNum("idle_threshold_minutes")} testid="set-idle" />
        <ToggleRow label="空闲回归确认" value={get("idle_confirm", "1") === "1"} onFlip={(v) => void act(() => data.settingSet("idle_confirm", v ? "1" : "0"))} testid="set-idleconfirm" />
      </section>

      <section data-sec="appearance" className="set-sec">
        <div className="detail-label">外观与排版</div>
        <ChoiceRow label="主题" value={themeNow} options={[["light", "亮 · 极简暖"], ["dark", "暗 · 工作台"]]} onCommit={setStr("theme")} testid="set-theme" />
        <ChoiceRow label="字号阶梯" value={get("font_scale", "standard")} options={[["compact", "紧凑"], ["standard", "标准"], ["loose", "宽松"]]} onCommit={setStr("font_scale")} testid="set-font" />
        <ChoiceRow label="版面密度" value={get("density", "standard")} options={[["compact", "紧凑"], ["standard", "标准"], ["loose", "宽松"]]} onCommit={setStr("density")} testid="set-density" />
        <ToggleRow label="窗口置顶" value={get("always_on_top", "0") === "1"} onFlip={(v) => void system.pin(v)} testid="set-topmost" />
        <NumRow label="左栏稿库宽度" unit="px" value={parseInt(get("lib_width", "300"))} min={240} max={360} step={10} onCommit={setNum("lib_width")} testid="set-libw" />
        <div className="set-row" data-testid="set-palette">
          <span className="set-label">色板</span>
          <span className="color-row">
            {pal.map((hex, i) => (
              <span key={i} className="color-cell" style={{ background: hex, cursor: "default" }} title={hex} />
            ))}
          </span>
        </div>
      </section>

      <section data-sec="hotkey" className="set-sec">
        <div className="detail-label">快捷键</div>
        <HotkeyRow value={get("hotkey", "Alt+Q")} onCommit={hotkeyCommit} testid="set-hotkey" />
      </section>

      <section data-sec="data" className="set-sec">
        <div className="detail-label">数据</div>
        <div className="set-row">
          <span className="set-label">事件日志</span>
          <button
            className="set-export"
            data-testid="export-events"
            onClick={() => {
              void data.exportEvents().then((p) => setExported(p)).catch(() => setExported("mock 环境无导出"));
            }}
          >
            导出 JSON
          </button>
        </div>
        {exported && <div className="set-exported num" data-testid="export-path">{exported}</div>}
      </section>
    </div>
  );
}
