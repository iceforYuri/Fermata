export function fmtDur(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function fmtClock(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fmtMmSs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * 老化双轴（2026-09-22 改，原对数 8h 渐褪）：
 * 行渐褪 1 → 0.45、标签墨深 0.38 → 1，同一根线性时间轴，4h（240m）触底/到顶。
 * 标签起点 0.38 = --ink-faint 的不透明度， fresh 观感与改前一致。
 */
export function agingOpacity(agingMs: number): number {
  const m = agingMs / 60_000;
  return Math.max(0.45, 1 - (0.55 * m) / 240);
}

/** 「挂 xx」标签墨深：淡墨 → 浓墨（与行渐褪同轴反向；hover 复活不及它） */
export function agingInk(agingMs: number): number {
  const m = agingMs / 60_000;
  return Math.min(1, 0.38 + (0.62 * m) / 240);
}

export function dateHeader(d = new Date()): string {
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`;
}
