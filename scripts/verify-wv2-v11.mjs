// v1.1 真实 WebView2 验证：MiSans 落地（document.fonts + 字形采样）、胶囊导航、rail
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "docs/screenshots/v11";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.connectOverCDP("http://localhost:9222");
const page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes("14200") && !p.url().includes("window="));
if (!page) process.exit(1);
await page.waitForSelector("[data-testid=board-page]", { timeout: 30000 });
await page.waitForTimeout(800);

// MiSans：document.fonts 已加载 + 实际渲染字体命中
const fontInfo = await page.evaluate(async () => {
  await document.fonts.ready;
  const faces = [];
  document.fonts.forEach((f) => faces.push(`${f.family} ${f.weight} ${f.status}`));
  const probe = document.querySelector("[data-testid=board-page]");
  const used = probe ? getComputedStyle(probe).fontFamily : "";
  return { faces, used };
});
console.log("[font] faces:", JSON.stringify(fontInfo.faces));
console.log("[font] used:", fontInfo.used);
const misansOk =
  fontInfo.faces.some((f) => f.startsWith("MiSans 400") && f.endsWith("loaded")) &&
  fontInfo.used.includes("MiSans");
console.log(`[font] MiSans 落地: ${misansOk ? "PASS" : "FAIL"}`);

// 字形采样比对：同字符 MiSans vs 回退字体宽度差（不同字体度量不同）
const glyph = await page.evaluate(() => {
  const cv = document.createElement("canvas");
  cv.width = 400; cv.height = 60;
  const ctx = cv.getContext("2d");
  ctx.font = '15px MiSans';
  const a = ctx.measureText("改 Fermata 数据内核 0123456789").width;
  ctx.font = '15px "Microsoft YaHei UI"';
  const b = ctx.measureText("改 Fermata 数据内核 0123456789").width;
  return { misans: a, yahei: b };
});
console.log(`[font] 字形度量 MiSans=${glyph.misans.toFixed(1)} YaHei=${glyph.yahei.toFixed(1)} 差异=${Math.abs(glyph.misans - glyph.yahei) > 0.5}`);

// 胶囊导航 + rail 真实截图
await page.screenshot({ path: `${OUT}/wv2-board-capsule.png` });
await page.hover("[data-testid=tab-stats]");
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/wv2-capsule-hover.png` });
await page.click("[data-testid=lib-rail]");
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/wv2-rail-open.png` });

await browser.close();
process.exit(misansOk ? 0 : 1);
