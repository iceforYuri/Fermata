// 顶栏初始态回归：页面刚加载（无任何点击）导航必须紧凑——仅当前页展开
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:14200";
const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 950 } });
await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");
await page.waitForTimeout(150); // 首帧后

const measure = () =>
  [...document.querySelectorAll(".morph-tab")].map((el) => ({
    key: el.dataset.testid,
    active: el.classList.contains("active"),
    w: Math.round(el.getBoundingClientRect().width),
    labelOpacity: parseFloat(getComputedStyle(el.querySelector(".nav-label")).opacity),
  }));
const m = await page.evaluate(measure);
console.log("加载后 150ms:", JSON.stringify(m));
const board = m.find((t) => t.key === "tab-board");
const others = m.filter((t) => t.key !== "tab-board");
const compact = board.w > 80 && board.labelOpacity > 0.95 && others.every((t) => t.w <= 38 && t.labelOpacity < 0.05);
console.log(compact ? "初始紧凑 PASS" : "初始摊开 FAIL");

// 再静置 1.5s 确认形态不回弹
await page.waitForTimeout(1500);
const m2 = await page.evaluate(measure);
const stable = JSON.stringify(m) === JSON.stringify(m2);
console.log(stable ? "静置稳定 PASS" : `静置漂移 FAIL ${JSON.stringify(m2)}`);
await browser.close();
process.exit(compact && stable ? 0 : 1);
