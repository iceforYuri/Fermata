// 内外沿角度走查：三色带在 外/中/内 三个半径上的角度覆盖对比
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
const cx = W / 2, cy = H / 2, s = W / 200;
const walk = (rCss, label) => {
  const r = rCss * s;
  const seq = [];
  for (let deg = 0; deg < 360; deg += 0.5) {
    const rad = ((deg - 90) * Math.PI) / 180;
    seq.push(classify(px(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)))) ?? ".");
  }
  const runs = [];
  for (let i = 0; i < seq.length; i++) {
    if (runs.length && runs[runs.length - 1].c === seq[i]) runs[runs.length - 1].to = i * 0.5;
    else runs.push({ c: seq[i], from: i * 0.5, to: i * 0.5 });
  }
  console.log(`${label}:`);
  for (const r2 of runs) console.log(`  ${r2.c}  ${r2.from.toFixed(1)}°–${r2.to.toFixed(1)}°`);
};
walk(100, "外沿 r=100");
walk(93, "中线 r=93");
walk(86, "内沿 r=86");
