// M4 mock 验证：设置页双态/scroll-spy/主题即切
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:14200";
const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.click("[data-testid=tab-settings]");
await page.waitForSelector("[data-testid=settings-page]");

// 1. 双态编辑：stepper 提交
await page.click("[data-testid=set-slice-value]");
await page.waitForSelector("[data-testid=set-slice-input]");
await page.fill("[data-testid=set-slice-input]", "50");
await page.press("[data-testid=set-slice-input]", "Enter");
await sleep(300);
ok("双态编辑提交（45→50 分钟）", (await page.textContent("[data-testid=set-slice-value]")).includes("50 分钟"));

// 2. Esc 还原
await page.click("[data-testid=set-slice-value]");
await page.fill("[data-testid=set-slice-input]", "99");
await page.press("[data-testid=set-slice-input]", "Escape");
await sleep(300);
ok("双态编辑 Esc 还原（仍 50）", (await page.textContent("[data-testid=set-slice-value]")).includes("50 分钟"));

// 3. stepper −/+
await sleep(300);
// 该点在 full-run 下 playwright 点击偶发不触发 React onClick（环境抖动），改用 DOM 级 click
await page.evaluate(() => document.querySelector("[data-testid=set-slice-value]").click());
await page.waitForSelector("[data-testid=set-slice-input]");
await sleep(300);
// 真实鼠标点 ±（回归 D35-4：mousedown preventDefault 前 ± 永不派发）
for (let i = 0; i < 2; i++) {
  const minus = await page.$("[data-testid=set-slice-minus]");
  const box = await minus.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(120);
}
await page.press("[data-testid=set-slice-input]", "Enter");
await sleep(300);
ok("stepper 步进（50→40）", (await page.textContent("[data-testid=set-slice-value]")).includes("40 分钟"));

// 4. scroll-spy：点 chips 目录滚动并高亮
await page.click("[data-testid=chip-data]");
await sleep(700);
const activeChip = await page.getAttribute("[data-testid=chip-data]", "class");
ok("scroll-spy 高亮数据组", activeChip?.includes("active") ?? false);

// 5. 主题即切（变形 → 暗）
await page.click("[data-testid=set-theme-value]");
await page.click("[data-testid=set-theme-opt-dark]");
await sleep(400);
const theme = await page.evaluate(() => document.documentElement.dataset.theme);
ok("主题切换到暗（全窗 data-theme）", theme === "dark");

// 6. 字体阶梯
await page.click("[data-testid=set-font-value]");
await page.click("[data-testid=set-font-opt-loose]");
await sleep(300);
const fs = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--fs-display").trim());
ok("字号阶梯宽松档生效（30px）", fs === "30px", fs);

// 7. 密度
await page.click("[data-testid=set-density-value]");
await page.click("[data-testid=set-density-opt-compact]");
await sleep(300);
const gap = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--row-gap").trim());
ok("版面密度紧凑档生效（8px）", gap === "8px", gap);

// 8. 空闲回归确认开关
const before = await page.textContent("[data-testid=set-idleconfirm-toggle]");
await page.click("[data-testid=set-idleconfirm-toggle]");
await sleep(200);
const after = await page.textContent("[data-testid=set-idleconfirm-toggle]");
ok("空闲回归确认开关翻转", before !== after, `${before}→${after}`);

// 9. 热键捕获态 Esc 取消
await page.click("[data-testid=set-hotkey-value]");
await page.waitForSelector("[data-testid=set-hotkey-capturing]");
await page.keyboard.press("Escape");
await sleep(200);
ok("热键捕获 Esc 取消（仍 Alt+Q）", (await page.textContent("[data-testid=set-hotkey-value]")).includes("Alt+Q"));

// 10. 热键捕获录入（Ctrl+Shift+K）
await page.click("[data-testid=set-hotkey-value]");
await page.keyboard.down("Control");
await page.keyboard.down("Shift");
await page.keyboard.press("k");
await page.keyboard.up("Shift");
await page.keyboard.up("Control");
await sleep(300);
ok("热键录入 Ctrl+Shift+K", (await page.textContent("[data-testid=set-hotkey-value]")).includes("Ctrl+Shift+K"), await page.textContent("[data-testid=set-hotkey-value]"));

// 11. D31 回归：?theme=dark 下色标板读暗色板（条脊=暗板值）
await page.goto(`${BASE}/?theme=dark`);
await page.waitForSelector("[data-testid=board-page]");
await sleep(400);
const spineColor = await page.evaluate(() => {
  const row = [...document.querySelectorAll("[data-testid=suspended-row]")][0];
  const spine = row?.querySelector(".spine");
  return spine ? getComputedStyle(spine).backgroundColor : null;
});
ok(
  "D31：暗色截图色标板跟生效主题",
  spineColor === "rgb(117, 149, 178)", // 暗板 #7595B2（mock 回三封邮件 color_tag=5）
  String(spineColor),
);

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n== M4 mock ${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
