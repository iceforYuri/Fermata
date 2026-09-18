// LCD 彩边抽查 v2：只在"亮度边缘"（文字轮廓）处统计通道分裂
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

function fringeAtEdges(path) {
  const png = PNG.sync.read(readFileSync(path));
  const { width: W, height: H, data } = png;
  const lum = (x, y) => {
    const i = (y * W + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };
  const ch = (x, y) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  let edges = 0;
  let fringe = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      // 水平亮度突变 = 文字/线条边缘
      if (Math.abs(lum(x - 1, y) - lum(x + 1, y)) > 60) {
        edges++;
        const [r, , b] = ch(x, y);
        if (Math.abs(r - b) > 35) fringe++;
      }
    }
  }
  return { edges, fringe, ratio: fringe / edges };
}

const oldR = fringeAtEdges("C:/Users/ice/AppData/Local/Temp/board-rich-old.png");
const newR = fringeAtEdges("docs/screenshots/m1/board-rich.png");
console.log(`旧（LCD 开）: 边缘 ${oldR.edges}，彩边 ${oldR.fringe}（${(oldR.ratio * 100).toFixed(2)}%）`);
console.log(`新（禁 LCD）: 边缘 ${newR.edges}，彩边 ${newR.fringe}（${(newR.ratio * 100).toFixed(2)}%）`);
console.log(newR.ratio < oldR.ratio * 0.5 ? "PASS：文字边缘彩边消除" : "CHECK");
