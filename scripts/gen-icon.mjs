// 生成 src-tauri/icons/icon.ico：暖米白底 + 墨色时间环（PoC 占位图标）
import { PNG } from "pngjs";
import { writeFileSync, mkdirSync } from "node:fs";

const S = 64;
const png = new PNG({ width: S, height: S });
const paper = [250, 247, 242];
const ink = [38, 34, 30];
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const dx = x - S / 2 + 0.5;
    const dy = y - S / 2 + 0.5;
    const r = Math.hypot(dx, dy);
    const onRing = r >= 22 && r <= 25;
    const c = onRing ? ink : paper;
    const i = (y * S + x) * 4;
    png.data[i] = c[0];
    png.data[i + 1] = c[1];
    png.data[i + 2] = c[2];
    png.data[i + 3] = 255;
  }
}
const pngBuf = PNG.sync.write(png);

// ICO 容器：单张 PNG（Vista+ 合法）
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const dir = Buffer.alloc(16);
dir.writeUInt8(S, 0);
dir.writeUInt8(S, 1);
dir.writeUInt8(0, 2);
dir.writeUInt8(0, 3);
dir.writeUInt16LE(1, 4);
dir.writeUInt16LE(32, 6);
dir.writeUInt32LE(pngBuf.length, 8);
dir.writeUInt32LE(22, 12);

mkdirSync("src-tauri/icons", { recursive: true });
writeFileSync("src-tauri/icons/icon.ico", Buffer.concat([header, dir, pngBuf]));
console.log("src-tauri/icons/icon.ico written");
