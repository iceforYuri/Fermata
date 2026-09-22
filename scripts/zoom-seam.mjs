// 12 点接缝区 1px 级 ASCII：看清微小瓣在那里长什么样
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const png = PNG.sync.read(readFileSync("docs/screenshots/v12/ring-exact.png"));
const { width: W, height: H, data: D } = png;
const px = (x, y) => {
  const i = (y * W + x) * 4;
  return [D[i], D[i + 1], D[i + 2]];
};
const PAL = { T: [0x3d, 0x7d, 0x67], G: [0x5f, 0x8a, 0x3c], B: [0x48, 0x6e, 0x8d], Y: [0xbe, 0x92, 0x29], R: [0xd0, 0x49, 0x3b], P: [0x97, 0x51, 0x6b] };
const classify = (c) => {
  let best = null, bd = 60;
  for (const [l, t] of Object.entries(PAL)) {
    const d = Math.abs(c[0] - t[0]) + Math.abs(c[1] - t[1]) + Math.abs(c[2] - t[2]);
    if (d < bd) { bd = d; best = l; }
  }
  return best;
};
const cx = W / 2, cy = H / 2, r = 93 * (W / 200), sw = 14 * (W / 200);
// 12 点区：x ∈ cx±35，y ∈ cy-r-sw-6 .. cy-r+sw+6（带外沿到带内沿）
for (let y = Math.round(cy - r - sw - 6); y <= Math.round(cy - r + sw + 6); y++) {
  let line = "";
  for (let x = Math.round(cx - 35); x <= Math.round(cx + 35); x++) {
    line += classify(px(x, y)) ?? ".";
  }
  console.log(line);
}
console.log(`(中心 ${cx},${cy} 半径 ${r.toFixed(0)} 带宽 ${sw.toFixed(0)})`);
