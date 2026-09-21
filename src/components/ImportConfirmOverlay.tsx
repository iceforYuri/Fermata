import { useState } from "react";
import { data } from "../api/data";
import { refreshBoard } from "../store/board";
import { setUi, useUi } from "../store/ui";

/**
 * 导入确认覆盖层（宪法 6：主窗内覆盖层，非模态窗）：
 * 页内玻璃遮罩（backdrop-filter 只盖自家内容）+ 中央实心小卡。
 * 确认 = 自动备份当前库 → 事务导入 → 回执进设置页数据组；取消 = 零副作用。
 */
export function ImportConfirmOverlay() {
  const { importConfirm } = useUi();
  const [busy, setBusy] = useState(false);
  if (!importConfirm) return null;

  const close = () => setUi({ importConfirm: null });
  const confirm = async () => {
    setBusy(true);
    try {
      const r = await data.importSnapshotFrom(importConfirm.path);
      await refreshBoard();
      setUi({
        importConfirm: null,
        dataEcho: `已导入 ${r.processes} 进程 / ${r.events} 事件 · 备份于 ${r.backup}`,
      });
    } catch (e) {
      setUi({ importConfirm: null, dataEcho: `导入失败：${e}` });
    } finally {
      setBusy(false);
    }
  };

  const exportedAt = importConfirm.exported_at
    ? new Date(importConfirm.exported_at).toLocaleString("zh-CN", { hour12: false })
    : "未知时间";
  return (
    <div className="import-confirm" data-testid="import-confirm">
      <div className="archive-backdrop" onClick={close} />
      <div className="import-card" data-testid="import-card">
        <div className="import-card-title">将替换当前全部数据</div>
        <div className="import-card-sub">
          快照：{importConfirm.processes} 进程 · {importConfirm.events} 事件 · 导出于 {exportedAt}
        </div>
        <div className="import-card-sub">是否先备份当前数据？（确认即自动备份到 exports）</div>
        <div className="import-card-ops">
          <button data-testid="import-cancel" onClick={close} disabled={busy}>
            取消
          </button>
          <button
            className="import-go"
            data-testid="import-confirm-btn"
            onClick={() => void confirm()}
            disabled={busy}
          >
            {busy ? "导入中…" : "备份并导入"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 截图用演示实例（路由 #/overlay/import-confirm） */
export function ImportConfirmDemo() {
  return (
    <div className="import-confirm" data-testid="import-confirm">
      <div className="archive-backdrop" />
      <div className="import-card" data-testid="import-card">
        <div className="import-card-title">将替换当前全部数据</div>
        <div className="import-card-sub">快照：12 进程 · 847 事件 · 导出于 2026-09-20 18:30:00</div>
        <div className="import-card-sub">是否先备份当前数据？（确认即自动备份到 exports）</div>
        <div className="import-card-ops">
          <button data-testid="import-cancel">取消</button>
          <button className="import-go" data-testid="import-confirm-btn">
            备份并导入
          </button>
        </div>
      </div>
    </div>
  );
}
