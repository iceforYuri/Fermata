import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { data, type BoardProcess } from "../api/data";
import { act, markHex, useBoard } from "../store/board";

/** 断点微弹窗：主窗直接点挂起行切换时的行旁小卡（Enter 确认 / Esc 取消整个切换）。
 *  断点留给旧进程；色标行给新进程——点色即生效、卡片不关，Enter 仍只确认断点。 */
export function BreakpointCard({
  oldTitle,
  newPid,
  rect,
  exiting,
  onConfirm,
  onCancel,
}: {
  oldTitle: string;
  newPid: number;
  rect: DOMRect;
  exiting?: boolean;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const bctx = useBoard();
  const bd = bctx.board;
  const newProc = bd
    ? ([bd.running, ...bd.suspended, ...bd.completed].filter((x): x is BoardProcess => x !== null).find(
        (x) => x.process.id === newPid,
      )?.process ?? null)
    : null;
  const curColor = newProc?.color_tag ?? null;
  const newTitle = newProc?.title ?? "新进程";
  // portal 到 body：fixed 定位以视口为锚；留在版面里会被页面过渡的 transform 劫持坐标（D42 规则）
  return createPortal(
    <div
      className={`micro-card bp-card${exiting ? " exiting" : ""}`}
      data-testid="bp-card"
      style={{
        position: "fixed",
        left: Math.min(rect.left, window.innerWidth - 340),
        // 贴被点行下方；贴近窗口底沿时钳住（卡高约 150px）
        top: Math.min(rect.bottom + 6, window.innerHeight - 150),
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
      <div className="bp-color">
        <div className="bp-color-label">给「{newTitle}」标个色</div>
        <div className="color-row" data-testid="bp-color-row">
          {[0, 1, 2, 3, 4, 5, 6].map((slot) => (
            <span
              key={slot}
              className={`color-cell${curColor === slot ? " selected" : ""}`}
              data-testid={`bp-color-${slot}`}
              style={{ background: markHex(bctx, slot) ?? undefined }}
              onMouseDown={(e) => e.preventDefault()} // 不抢输入框焦点（blur 会取消整张卡）
              onClick={() => void act(() => data.colorSet(newPid, slot))}
            />
          ))}
          <span
            className={`color-cell none${curColor === null ? " selected" : ""}`}
            data-testid="bp-color-none"
            title="无色标"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void act(() => data.colorSet(newPid, null))}
          >
            ∅
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** 空闲回归确认：30 秒超时默认"是"（文档明文） */
export function IdleConfirmCard({
  title,
  exiting,
  onAnswer,
}: {
  title: string;
  exiting?: boolean;
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
    <div className={`micro-card idle-card${exiting ? " exiting" : ""}`} data-testid="idle-card">
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
