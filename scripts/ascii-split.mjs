// 把双色格裁片画成 ASCII 形状图（A/B/.）——没有图像查看也能"看见"接缝
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const file = process.argv[2];
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
// 找两个主色（量化）
const clusters = new Map();
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const [r, g, b] = px(x, y);
    if (sat(r, g, b) > 0.1 && !(r > 235 && g > 230 && b > 220)) {
      const k = `${r >> 4},${g >> 4},${b >> 4}`;
      clusters.set(k, (clusters.get(k) ?? 0) + 1);
    }
  }
const two = [...clusters.entries()].filter(([, n]) => n > 20).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k.split(",").map((v) => Number(v) << 4));
if (two.length !== 2) { console.log("颜色数不对", clusters.size); process.exit(1); }
const near = (c, t) => Math.abs(c[0] - t[0]) + Math.abs(c[1] - t[1]) + Math.abs(c[2] - t[2]) < 60;

// 圆心 = 联合包围盒中心；输出圆域 ASCII（步长 2px）
const colored = [];
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const c = px(x, y);
    if (near(c, two[0]) || near(c, two[1])) colored.push({ x, y });
  }
const cx = (Math.min(...colored.map((p) => p.x)) + Math.max(...colored.map((p) => p.x))) / 2;
const cy = (Math.min(...colored.map((p) => p.y)) + Math.max(...colored.map((p) => p.y))) / 2;
const r = (Math.max(...colored.map((p) => p.x)) - Math.min(...colored.map((p) => p.x))) / 2;
console.log(`圆心(${cx.toFixed(0)},${cy.toFixed(0)}) r=${r.toFixed(0)}  色A=${two[0]} 色B=${two[1]}`);
for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y += 2) {
  let line = "";
  for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x += 2) {
    const c = px(Math.min(Math.max(x, 0), W - 1), Math.min(Math.max(y, 0), H - 1));
    if (near(c, two[0])) line += "A";
    else if (near(c, two[1])) line += "B";
    else line += ".";
  }
  console.log(line);
}
