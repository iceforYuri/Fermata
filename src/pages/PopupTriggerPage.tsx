import { useState } from "react";
import { system, type FocusTestResult } from "../api/system";

export default function PopupTriggerPage() {
  const [result, setResult] = useState<FocusTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await system.spawnPocPopup());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="trigger-page">
      <h1>原语A · 不抢焦点弹窗</h1>
      <p className="sub">
        点击后由 Rust 侧创建 420×280 实心暖卡弹窗（decorations off / always-on-top /
        focusable false / skip-taskbar），断言前台窗口不变且扩展样式含
        WS_EX_NOACTIVATE。
      </p>
      <button className="trigger-btn" data-testid="spawn-popup-btn" onClick={run} disabled={busy}>
        {busy ? "创建中…" : "触发展示弹窗"}
      </button>
      {error && <p className="focus-result">调用失败：{error}</p>}
      {result && (
        <div className="focus-result" data-testid="focus-result" data-pass={result.pass}>
          <p className={`verdict ${result.pass ? "pass" : "fail"}`}>
            {result.pass ? "PASS · 前台未易主，弹窗带 WS_EX_NOACTIVATE" : "FAIL · 见下表"}
          </p>
          <table>
            <tbody>
              <tr>
                <td>前台句柄（前 → 后）</td>
                <td className="mono">
                  {result.beforeHwnd} → {result.afterHwnd}
                </td>
              </tr>
              <tr>
                <td>前台标题（前 → 后）</td>
                <td>
                  {result.beforeTitle} → {result.afterTitle}
                </td>
              </tr>
              <tr>
                <td>弹窗 GWL_EXSTYLE</td>
                <td className="mono">{result.exStyle}</td>
              </tr>
              <tr>
                <td>WS_EX_NOACTIVATE</td>
                <td>{result.hasNoActivate ? "含" : "不含"}</td>
              </tr>
              <tr>
                <td>前台未变</td>
                <td>{result.foregroundUnchanged ? "是" : "否"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
