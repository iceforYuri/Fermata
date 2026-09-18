import { useEffect, useRef, useState } from "react";

/** 断点微弹窗：主窗直接点挂起行切换时的行旁小卡（Enter 确认 / Esc 取消整个切换） */
export function BreakpointCard({
  oldTitle,
  rect,
  onConfirm,
  onCancel,
}: {
  oldTitle: string;
  rect: DOMRect;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      className="micro-card"
      data-testid="bp-card"
      style={{
        position: "fixed",
        left: Math.min(rect.left, window.innerWidth - 340),
        top: rect.bottom + 6,
      }}
    >
      <input
        ref={ref}
        className="switcher-input"
        data-testid="bp-card-input"
        placeholder={`给「${oldTitle}」留个断点（可空）↵`}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm(v.trim());
          if (e.key === "Escape") onCancel();
        }}
        onBlur={onCancel}
      />
    </div>
  );
}

/** 空闲回归确认：30 秒超时默认"是"（文档明文） */
export function IdleConfirmCard({
  title,
  onAnswer,
}: {
  title: string;
  onAnswer: (yes: boolean) => void;
}) {
  const [left, setLeft] = useState(30);
  useEffect(() => {
    const t = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          clearInterval(t);
          onAnswer(true);
          return 0;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="micro-card idle-card" data-testid="idle-card">
      <div className="idle-q">刚才还在做「{title}」吗？</div>
      <div className="idle-btns">
        <button data-testid="idle-yes" onClick={() => onAnswer(true)}>
          是
        </button>
        <button data-testid="idle-no" onClick={() => onAnswer(false)}>
          否
        </button>
        <span className="aging-label num">{left}s</span>
      </div>
    </div>
  );
}
