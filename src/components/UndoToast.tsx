import { useUi } from "../store/ui";
import { undoComplete } from "../store/actions";

/** 3 秒撤销 toast：不撤销则折入完成档案 */
export function UndoToast() {
  const { toast } = useUi();
  if (!toast) return null;
  return (
    <div className="undo-toast" data-testid="undo-toast">
      <span>「{toast.title}」已完成</span>
      <span className="undo" data-testid="undo-btn" onClick={() => void undoComplete()}>
        撤销
      </span>
      <span className="life" />
    </div>
  );
}
