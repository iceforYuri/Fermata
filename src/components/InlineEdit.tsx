import { useEffect, useRef, useState } from "react";

/**
 * 双态编辑：非编辑态=纯排版文字；点击原地变形为输入框（同字号同位置），
 * 1px 下划线是唯一编辑指示；Enter/失焦提交，Esc 还原。
 */
export function InlineEdit({
  value,
  onCommit,
  className = "",
  placeholder = "",
  editColor,
  multiline = false,
  testid,
  onEditingChange,
  disabled = false,
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
  placeholder?: string;
  editColor?: string | null;
  multiline?: boolean;
  testid?: string;
  onEditingChange?: (editing: boolean) => void;
  disabled?: boolean; // 禁用=纯展示（完成态等），保持同一 DOM 节点以便状态翻转时过渡连续
}) {
  const [editing, setEditingState] = useState(false);
  const setEditing = (v: boolean) => {
    setEditingState(v);
    onEditingChange?.(v);
  };
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      ref.current?.focus();
      ref.current?.select();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onCommit(draft.trim());
  };
  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        className={`inline-display${disabled ? " disabled" : ""}${multiline ? " multiline" : ""} ${className}`}
        data-testid={testid}
        onClick={() => {
          if (!disabled) setEditing(true);
        }}
      >
        {value || <span style={{ opacity: 0.35 }}>{placeholder}</span>}
      </span>
    );
  }
  const style = { "--ec": editColor ?? undefined } as React.CSSProperties;
  const shared = {
    ref,
    className: `inline-edit ${className}`,
    style,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !multiline) commit();
      if (e.key === "Enter" && multiline && (e.ctrlKey || e.metaKey)) commit();
      if (e.key === "Escape") cancel();
    },
    "data-testid": testid ? `${testid}-editing` : undefined,
  };
  return multiline ? <textarea {...shared} rows={4} /> : <input {...shared} />;
}
