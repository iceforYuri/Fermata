// 大环裁片 ASCII 化：7 色各配一个字母，看瓣缝是否过圆心
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const png = PNG.sync.read(readFileSync(process.argv[2]));
const { width: W, height: H, data: D } = png;
const px = (x, y) => {
  const i = (y * W + x) * 4;
  return [D[i], D[i + 1], D[i + 2]];
};
const COLORS = [
  ["T", [0x3d, 0x7d, 0x67]], // teal
  ["G", [0x5f, 0x8a, 0x3c]], // green
  ["B", [0x48, 0x6e, 0x8d]], // blue
  ["Y", [0xbe, 0x92, 0x29]], // yellow
  ["R", [0xd0, 0x49, 0x3b]], // red
  ["P", [0x97, 0x51, 0x6b]], // purple
];
const dist = (c, t) => Math.abs(c[0] - t[0]) + Math.abs(c[1] - t[1]) + Math.abs(c[2] - t[2]);
// 最近色归类（ teal/blue 距离近，先匹配会误判 ）
const classify = (c) => {
  let best = null;
  let bd = 80; // 最近色距离阈值
  for (const [letter, t] of COLORS) {
    const d = dist(c, t);
    if (d < bd) { bd = d; best = letter; }
  }
  return best;
};

// 找环心：彩色像素质心
const coloredPts = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (classify(px(x, y))) coloredPts.push({ x, y });
  }
const cx = coloredPts.reduce((a, p) => a + p.x, 0) / coloredPts.length;
const cy = coloredPts.reduce((a, p) => a + p.y, 0) / coloredPts.length;
console.log(`环心≈(${cx.toFixed(0)},${cy.toFixed(0)})  彩色像素 ${coloredPts.length}`);

// 以环心为中心的局部图（3px/格，半径 110px）
for (let y = Math.floor(cy - 108); y <= cy + 108; y += 3) {
  let line = "";
  for (let x = Math.floor(cx - 108); x <= cx + 108; x += 3) {
    if (x < 0 || y < 0 || x >= W || y >= H) { line += " "; continue; }
    // 3x3 块投票（最近色）
    const votes = {};
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = px(Math.min(Math.max(x + dx, 0), W - 1), Math.min(Math.max(y + dy, 0), H - 1));
        const l = classify(c);
        if (l) votes[l] = (votes[l] ?? 0) + 1;
      }
    const best = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    line += best && best[1] >= 2 ? best[0] : ".";
  }
  console.log(line);
}
