/**
 * 原语B · 休息页玻璃小样
 * 底层：模拟版面的色标条纹；上层：页内 backdrop-filter 玻璃。
 */
const STRIPES = [
  { color: "#b4532f", label: "进程 · 译稿第三章" },
  { color: "#b98a2e", label: "进程 · 季度报表核对" },
  { color: "#6d7f3a", label: "进程 · 给园丁的回信" },
  { color: "#3f7a66", label: "进程 · API 断点续传" },
  { color: "#476a85", label: "进程 · 读《形式的起源》" },
  { color: "#8a5a44", label: "进程 · 账目归档" },
  { color: "#97506b", label: "进程 · 周末路线草图" },
];

// 供证据脚本采样：条纹颜色与其几何中心
declare global {
  interface Window {
    __stripes?: { color: string }[];
  }
}
window.__stripes = STRIPES;

export default function RestPage() {
  return (
    <div className="rest-page">
      <div className="rest-board">
        {STRIPES.map((s) => (
          <div
            key={s.color}
            className="rest-stripe"
            data-stripe={s.color}
            style={{ background: s.color }}
          >
            {s.label}
          </div>
        ))}
      </div>
      <div className="rest-glass" data-testid="rest-glass">
        <div className="rest-center">
          <svg className="rest-ring" viewBox="0 0 64 64" aria-hidden>
            <circle
              cx="32"
              cy="32"
              r="29"
              fill="none"
              stroke="rgba(38,34,30,0.3)"
              strokeWidth="2"
            />
            <polygon points="27,22 27,42 45,32" fill="rgba(38,34,30,0.78)" />
          </svg>
          <div className="rest-title num">休息中 · 0:00</div>
        </div>
      </div>
    </div>
  );
}
