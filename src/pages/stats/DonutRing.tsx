import { effectiveTheme, useBoard } from "../../store/board";
import type { ShareByColor } from "../../api/data";

/** 环形统计（大环/迷你日环/月环共用）：shares 按色标聚合，null=中性灰 */
export function DonutRing({
  shares,
  size,
  stroke,
  testid,
  onClick,
}: {
  shares: ShareByColor[];
  size: number;
  stroke: number;
  testid?: string;
  onClick?: () => void;
}) {
  const board = useBoard();
  const pal = board.palette[effectiveTheme(board)];
  const hex = (slot: number | null) =>
    slot === null ? "var(--ring-neutral)" : pal[slot] ?? "var(--ring-neutral)";

  const total = shares.reduce((a, s) => a + s.ms, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      data-testid={testid}
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--hairline)"
        strokeWidth={stroke}
        opacity={0.35}
      />
      {total > 0 &&
        shares.map((s, i) => {
          const frac = s.ms / total;
          const dash = frac * c;
          const offset = -acc * c;
          acc += frac;
          return (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={hex(s.color_tag)}
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
        })}
    </svg>
  );
}
