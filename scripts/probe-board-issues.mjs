// 进程页两问题实测：断点卡落点几何 + 长内容卡片高度行为
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto("http://127.0.0.1:14200");
await page.waitForSelector("[data-testid=board-page]");
await sleep(600);

// --- A. 断点卡落点：点队列中部一行 ---
const rows = await page.$$("[data-testid=suspended-row]");
console.log("挂起行数:", rows.length);
const midIdx = Math.min(2, rows.length - 1);
const clicked = await page.evaluate((i) => {
  const el = document.querySelectorAll("[data-testid=suspended-row]")[i];
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, title: el.querySelector(".suspended-title").textContent };
}, midIdx);
await page.locator("[data-testid=suspended-row] .row-main").nth(midIdx).click();
await page.waitForSelector("[data-testid=bp-card]");
await sleep(300);
const geo = await page.evaluate(() => {
  const card = document.querySelector("[data-testid=bp-card]").getBoundingClientRect();
  const active = document.querySelector("[data-testid=active-row]")?.getBoundingClientRect();
  return {
    card: { left: card.left, top: card.top, w: card.width },
    activeBottom: active ? active.bottom : null,
  };
});
console.log("被点行:", JSON.stringify(clicked));
console.log("断点卡几何:", JSON.stringify(geo));
console.log("→ 卡与被点行间距:", Math.round(geo.card.top - clicked.bottom), "px；与活跃行底部间距:", geo.activeBottom ? Math.round(geo.card.top - geo.activeBottom) : "无活跃");
await page.screenshot({ path: "docs/screenshots/v12/probe-bp-pos.png" });
await page.keyboard.press("Escape");
await sleep(300);

// --- B. 长标题卡片高度 ---
const LONG = "这是一个标题特别特别特别长的进程用来测试卡片会不会自动增加高度而不是固定不动";
await page.click("[data-testid=new-row-input]");
await page.keyboard.type(LONG);
await page.keyboard.press("Enter");
await sleep(600);
const hProbe = await page.evaluate((long) => {
  const out = {};
  const sus = [...document.querySelectorAll("[data-testid=suspended-row]")].map((el) => {
    const r = el.getBoundingClientRect();
    return { title: el.querySelector(".suspended-title").textContent.slice(0, 12), h: Math.round(r.height) };
  });
  out.suspended = sus;
  const longRow = [...document.querySelectorAll("[data-testid=suspended-row]")].find((el) =>
    el.querySelector(".suspended-title").textContent.includes("标题特别"),
  );
  if (longRow) {
    const t = longRow.querySelector(".suspended-title");
    out.longTitle = {
      rowH: Math.round(longRow.getBoundingClientRect().height),
      titleH: Math.round(t.getBoundingClientRect().height),
      titleLines: Math.round(t.getBoundingClientRect().height / 20),
      clipped: t.scrollHeight > t.clientHeight + 1,
      nowrap: getComputedStyle(t).whiteSpace,
    };
  }
  return out;
}, LONG);
console.log("挂起行高度:", JSON.stringify(hProbe, null, 2));

// 把它激活，看活跃卡是否长高
const longRowIdx = await page.evaluate(() =>
  [...document.querySelectorAll("[data-testid=suspended-row]")].findIndex((el) =>
    el.querySelector(".suspended-title").textContent.includes("标题特别"),
  ),
);
if (longRowIdx >= 0) {
  await page.locator("[data-testid=suspended-row] .row-main").nth(longRowIdx).click();
  await page.waitForSelector("[data-testid=bp-card]");
  await page.keyboard.press("Enter"); // 空断点确认
  await sleep(700);
  const act = await page.evaluate(() => {
    const el = document.querySelector("[data-testid=active-row]");
    const t = el.querySelector(".active-title");
    return {
      rowH: Math.round(el.getBoundingClientRect().height),
      titleH: Math.round(t.getBoundingClientRect().height),
      clipped: t.scrollHeight > t.clientHeight + 1,
      nowrap: getComputedStyle(t).whiteSpace,
    };
  });
  console.log("活跃卡（长标题）:", JSON.stringify(act));
  await page.screenshot({ path: "docs/screenshots/v12/probe-card-height.png" });
}
await browser.close();
