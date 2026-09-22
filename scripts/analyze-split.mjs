// 双色圆接缝分析：找出截图中的圆形标记，量两种颜色的质心方向
// 期望：45° 对半 → 两色质心应在圆心的 (+d,+d) 与 (-d,-d)（右下/左上）
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const file = process.argv[2];
const png = PNG.sync.read(readFileSync(file));
const { width: W, height: H, data: D } = png;
console.log(`图像 ${W}x${H}`);

const px = (x, y) => {
  const i = (y * W + x) * 4;
  return [D[i], D[i + 1], D[i + 2]];
};
// 颜色key（量化到 8 级聚类）
const key = (r, g, b) => `${r >> 3},${g >> 3},${b >> 3}`;
// 饱和度（区分彩色与纸底/灰）
const sat = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

// 1. 收集强饱和像素
const colored = new Map(); // key -> [{x,y}]
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const [r, g, b] = px(x, y);
    if (sat(r, g, b) > 0.12 && !(r > 235 && g > 230 && b > 220)) {
      const k = key(r, g, b);
      if (!colored.has(k)) colored.set(k, []);
      colored.get(k).push({ x, y });
    }
  }
}
// 保留像样颜色的 key（按数量排序，过滤噪点）
const keys = [...colored.entries()].filter(([, v]) => v.length > 200).sort((a, b) => b[1].length - a[1].length).slice(0, 12);
console.log("主色簇:", keys.map(([k, v]) => `${k}×${v.length}`).join("  "));

// 2. 对前 8 个色簇做连通域（粗网格近似：把像素撒到网格找圆斑中心）
// 简化：圆斑直径~23-46px。按 8px 网格统计每格各色密度，密度峰=圆心候选
for (const [k, pts] of keys.slice(0, 8)) {
  // 网格化找簇
  const cell = new Map();
  for (const p of pts) {
    const gx = Math.floor(p.x / 16), gy = Math.floor(p.y / 16);
    const kk = `${gx},${gy}`;
    cell.set(kk, (cell.get(kk) ?? 0) + 1);
  }
  const peaks = [...cell.entries()].filter(([, n]) => n > 20);
  if (!peaks.length) continue;
  // 每个峰：以峰为中心的 48x48 窗口内分析全部颜色（不只本簇）
  const peak = peaks[0];
  const [gx, gy] = peak[0].split(",").map(Number);
  const cx0 = gx * 16 + 8, cy0 = gy * 16 + 8;
  const colors = new Map();
  for (let y = cy0 - 24; y < cy0 + 24; y++) {
    for (let x = cx0 - 24; x < cx0 + 24; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const [r, g, b] = px(x, y);
      if (sat(r, g, b) > 0.12 && !(r > 235 && g > 230 && b > 220)) {
        const kk = key(r, g, b);
        if (!colors.has(kk)) colors.set(kk, []);
        colors.get(kk).push({ x, y });
      }
    }
  }
  const two = [...colors.entries()].filter(([, v]) => v.length > 30).sort((a, b) => b[1].length - a[1].length).slice(0, 2);
  if (two.length === 2) {
    // 圆心 = 两色联合包围盒中心
    const all = [...two[0][1], ...two[1][1]];
    const minX = Math.min(...all.map((p) => p.x)), maxX = Math.max(...all.map((p) => p.x));
    const minY = Math.min(...all.map((p) => p.y)), maxY = Math.max(...all.map((p) => p.y));
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const centroids = two.map(([k2, v]) => {
      const mx = v.reduce((a, p) => a + p.x, 0) / v.length;
      const my = v.reduce((a, p) => a + p.y, 0) / v.length;
      return { color: k2, n: v.length, dx: +(mx - cx).toFixed(1), dy: +(my - cy).toFixed(1) };
    });
    console.log(`双色圆 @(${cx0},${cy0}) 圆心(${(cx).toFixed(0)},${(cy).toFixed(0)}):`, JSON.stringify(centroids));
  }
}
