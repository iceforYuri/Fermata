// 单个双色格裁片的接缝校验：两色质心应在圆心 (+d,+d) 与 (-d,-d)
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

for (const file of process.argv.slice(2)) {
  const png = PNG.sync.read(readFileSync(file));
  const { width: W, height: H, data: D } = png;
  const px = (x, y) => {
    const i = (y * W + x) * 4;
    return [D[i], D[i + 1], D[i + 2]];
  };
  const sat = (r, g, b) => {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  // 收集彩色像素，按量化色分簇
  const clusters = new Map();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const [r, g, b] = px(x, y);
      if (sat(r, g, b) > 0.1 && !(r > 235 && g > 230 && b > 220)) {
        const k = `${r >> 4},${g >> 4},${b >> 4}`;
        if (!clusters.has(k)) clusters.set(k, []);
        clusters.get(k).push({ x, y });
      }
    }
  const two = [...clusters.entries()].filter(([, v]) => v.length > 20).sort((a, b) => b[1].length - a[1].length).slice(0, 2);
  if (two.length !== 2) {
    console.log(`${file}: 检出 ${two.length} 色（期望 2）`, [...clusters.entries()].map(([k, v]) => `${k}×${v.length}`).join(" "));
    continue;
  }
  const all = [...two[0][1], ...two[1][1]];
  const cx = (Math.min(...all.map((p) => p.x)) + Math.max(...all.map((p) => p.x))) / 2;
  const cy = (Math.min(...all.map((p) => p.y)) + Math.max(...all.map((p) => p.y))) / 2;
  const out = two.map(([k, v]) => {
    const mx = v.reduce((a, p) => a + p.x, 0) / v.length - cx;
    const my = v.reduce((a, p) => a + p.y, 0) / v.length - cy;
    return { color: k, n: v.length, dx: +mx.toFixed(1), dy: +my.toFixed(1) };
  });
  // 期望：一色 (+,+)、另一色 (-,-)，且 |dx|≈|dy|
  const good =
    Math.sign(out[0].dx) === Math.sign(out[0].dy) &&
    Math.sign(out[1].dx) === Math.sign(out[1].dy) &&
    Math.sign(out[0].dx) !== Math.sign(out[1].dx) &&
    Math.abs(Math.abs(out[0].dx) - Math.abs(out[0].dy)) < 3 &&
    Math.abs(Math.abs(out[1].dx) - Math.abs(out[1].dy)) < 3;
  console.log(`${file}: ${good ? "✓ 接缝正常" : "✗ 接缝异常"} ${JSON.stringify(out)}`);
}
