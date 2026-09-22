// 用户附件缩略图整体 ASCII 化：看清截图里到底是什么视图
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const png = PNG.sync.read(readFileSync(process.argv[2]));
const { width: W, height: H, data: D } = png;
const px = (x, y) => {
  const i = (y * W + x) * 4;
  return [D[i], D[i + 1], D[i + 2]];
};
const sat = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};
// 4x4 块平均 → 88x50
const bw = 4;
for (let y = 0; y < H; y += bw) {
  let line = "";
  for (let x = 0; x < W; x += bw) {
    let rs = 0, gs = 0, bs = 0, n = 0;
    for (let dy = 0; dy < bw && y + dy < H; dy++)
      for (let dx = 0; dx < bw && x + dx < W; dx++) {
        const [r, g, b] = px(x + dx, y + dy);
        rs += r; gs += g; bs += b; n++;
      }
    const r = rs / n, g = gs / n, b = bs / n;
    const s = sat(r, g, b);
    const lum = (r + g + b) / 3;
    if (s > 0.18) line += "O";      // 彩色（色标）
    else if (lum < 90) line += "#"; // 深（文字/深底）
    else if (lum < 150) line += "+";
    else if (lum < 210) line += "-";
    else line += ".";
  }
  console.log(line);
}
