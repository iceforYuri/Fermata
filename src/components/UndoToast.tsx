import { useRef } from "react";
import { useUi } from "../store/ui";
import { undoComplete } from "../store/actions";
import { useExiting } from "./useExiting";

/** 3 秒撤销 toast：不撤销则折入完成档案；出场 toast-out（useExiting 播反场） */
export function UndoToast() {
  const { toast } = useUi();
  const { mounted, exiting } = useExiting(!!toast);
  const last = useRef(toast);
  if (toast) last.current = toast;
  if (!mounted || !last.current) return null;
  const t = toast ?? last.current;
  return (
    <div className={`undo-toast${exiting ? " exiting" : ""}`} data-testid="undo-toast">
      <span>「{t.title}」已完成</span>
      <span className="undo" data-testid="undo-btn" onClick={() => void undoComplete()}>
        撤销
      </span>
      <span className="life" />
    </div>
  );
}
