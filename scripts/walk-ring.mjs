// 沿大环中心线逐角度采样：数据说每瓣该占多少度，像素说实际占多少度
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { writeFileSync, readFileSync } from "node:fs";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = browser.contexts()[0].pages().find((p) => !p.url().includes("overlay"));

// 环 svg 精确裁切
const el = page.locator("[data-testid=big-ring]");
await el.screenshot({ path: "docs/screenshots/v12/ring-exact.png" });
// 同时取数据层份额（从 DOM 的 dash 值反推）
const segs = await page.evaluate(() => {
  const svg = document.querySelector("[data-testid=big-ring]");
  return [...svg.querySelectorAll("circle[stroke-dasharray]")].map((c) => ({
    stroke: c.getAttribute("stroke"),
    dash: parseFloat(c.getAttribute("stroke-dasharray").split(" ")[0]),
    offset: parseFloat(c.getAttribute("stroke-dashoffset")),
  }));
});
await browser.close?.().catch(() => {});
process.exitCode = 0;

const png = PNG.sync.read(readFileSync("docs/screenshots/v12/ring-exact.png"));
const { width: W, height: H, data: D } = png;
console.log(`环图 ${W}x${H}（DPR=${(W / 200).toFixed(2)}）`);
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

const cx = W / 2, cy = H / 2, r = 93 * (W / 200);
const seq = [];
for (let deg = 0; deg < 360; deg += 1) {
  // 0° = 12 点方向，顺时针
  const rad = ((deg - 90) * Math.PI) / 180;
  const x = Math.round(cx + r * Math.cos(rad));
  const y = Math.round(cy + r * Math.sin(rad));
  seq.push(classify(px(x, y)) ?? ".");
}
// 压缩成段
const runs = [];
for (let i = 0; i < 360; i++) {
  const c = seq[i];
  if (runs.length && runs[runs.length - 1].c === c) runs[runs.length - 1].to = i;
  else runs.push({ c, from: i, to: i });
}
console.log("像素实测（从 12 点顺时针）:");
for (const r2 of runs) console.log(`  ${r2.c}  ${r2.from}°–${r2.to}° (${r2.to - r2.from + 1}°)`);

// 数据期望
const c = 2 * Math.PI * 93;
let acc = 0;
console.log("数据期望:");
for (const s of segs) {
  const from = (acc / c) * 360;
  acc += s.dash;
  const to = (acc / c) * 360;
  const letter = Object.entries(PAL).find(([, t]) => `#${t.map((v) => v.toString(16).padStart(2, "0")).join("")}` === s.stroke)?.[0] ?? "?";
  console.log(`  ${letter}  ${from.toFixed(1)}°–${to.toFixed(1)}° (${(to - from).toFixed(1)}°)`);
}
process.exit(0);
