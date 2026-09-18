// DWM 圆角核验：主窗四角像素 vs 边框内侧像素（桌面截图 wv2-popup-desktop.png）
import { chromium } from "playwright";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";

const browser = await chromium.connectOverCDP("http://localhost:9222");
const page = browser
  .contexts()
  .flatMap((c) => c.pages())
  .find((p) => p.url().includes("127.0.0.1:14200") && !p.url().includes("poc-popup"));
const rect = await page.evaluate(() => ({
  x: window.screenX,
  y: window.screenY,
  w: window.outerWidth,
  h: window.outerHeight,
  dpr: window.devicePixelRatio,
}));
console.log("main window rect (css px):", JSON.stringify(rect));
await browser.close();

const png = PNG.sync.read(readFileSync("docs/screenshots/poc/wv2-popup-desktop.png"));
console.log("desktop png size:", png.width, "x", png.height);
const dpr = rect.dpr;
const X = Math.round(rect.x * dpr);
const Y = Math.round(rect.y * dpr);
const W = Math.round(rect.w * dpr);
const H = Math.round(rect.h * dpr);
const px = (x, y) => {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// 沿四角对角线采样 k=0..6，圆角则前几个像素透出背景色
for (const [name, cornerAt, inwardAt] of [
  ["左上", (k) => [X + k, Y + k], () => [X + 12, Y + 3]],
  ["右上", (k) => [X + W - 1 - k, Y + k], () => [X + W - 13, Y + 3]],
]) {
  const inner = px(...inwardAt());
  const series = [];
  for (let k = 0; k <= 6; k++) {
    const c = px(...cornerAt(k));
    series.push(dist(c, inner) > 30 ? "背" : "窗");
  }
  console.log(`${name}: ${series.join("")}（背=透出背景/圆角，窗=窗口色） inner=${inner}`);
}
