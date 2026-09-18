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

/** 老化渐褪曲线：1 → 0.45，对数前快后慢（8h 触底） */
export function agingOpacity(agingMs: number): number {
  const m = agingMs / 60_000;
  return Math.max(0.45, 1 - (0.55 * Math.log(1 + m / 8)) / Math.log(1 + 480 / 8));
}

export function dateHeader(d = new Date()): string {
  const week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()];
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${week}`;
}
