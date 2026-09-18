import { useState } from "react";
import { fmtMmSs } from "../util";

/**
 * 时间环：64px，环色=色标色；环内剩余整分钟，悬停 mm:ss；
 * 最后 5 分钟缓慢呼吸（全 app 唯一活物）；暂停=停走变暗。
 */
export function TimeRing({
  remainingMs,
  totalMs,
  color,
  dimmed,
  testid,
}: {
  remainingMs: number;
  totalMs: number;
  color: string | null;
  dimmed: boolean;
  testid?: string;
}) {
  const [hover, setHover] = useState(false);
  const size = 64;
  const stroke = 3;
  const r = (size - stroke) / 2 - 1;
  const c = 2 * Math.PI * r;
  const frac = totalMs > 0 ? Math.max(0, Math.min(1, remainingMs / totalMs)) : 0;
  const ringColor = color ?? "var(--ink-ghost)";
  const breathing = !dimmed && remainingMs <= 5 * 60_000 && remainingMs > 0;
  const minutes = Math.max(0, Math.ceil(remainingMs / 60_000));

  return (
    <div
      className={`time-ring${dimmed ? " dimmed" : ""}${breathing ? " breathing" : ""}`}
      data-testid={testid}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={fmtMmSs(remainingMs)}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--hairline)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ringColor}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          strokeLinecap="butt"
          style={{ transition: "stroke-dashoffset 1s linear" }}
          opacity={dimmed ? 0.35 : 1}
        />
      </svg>
      <span className="ring-label">
        {hover ? fmtMmSs(remainingMs) : `${minutes}`}
      </span>
    </div>
  );
}
