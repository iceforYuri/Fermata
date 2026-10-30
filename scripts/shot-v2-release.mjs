// 2.0 产品截图：当前组件 + mock 演示库；浏览器预览，不代表原生能力验收。
// 先运行 pnpm dev，再运行 node scripts/shot-v2-release.mjs。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const out = "docs/screenshots/release/v2";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors = [];
const captures = [];
const base = "http://127.0.0.1:14200";

async function capture(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}.png` });
  captures.push(name);
  console.log(`截图：${name}`);
}

try {
  for (const mobile of [false, true]) {
    const prefix = mobile ? "android" : "windows";
    const context = await browser.newContext({
      viewport: mobile ? { width: 412, height: 915 } : { width: 1200, height: 800 },
      deviceScaleFactor: mobile ? 2 : 1,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      ...(mobile ? { userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36", isMobile: true, hasTouch: true } : {}),
    });
    // 仅预览进程内的原生桥替身：保留数据层的浏览器 mock 判定，
    // 不伪造 __TAURI_INTERNALS__，不连接通知或系统事件。
    await context.route(/\/(?:node_modules\/\.vite\/deps\/@tauri-apps_api_event\.js|src\/api\/keeper\.ts)(?:\?.*)?$/, (route) => {
      const body = route.request().url().includes("keeper.ts")
        ? "export const keeper = { update() {}, hide() {}, scheduleReminder() {}, cancelReminder() {}, async onAction() { return () => {}; } };"
        : "export async function listen() { return () => {}; }";
      return route.fulfill({ contentType: "text/javascript", body });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${prefix}: ${e.message}`));
    // 固定演示日期与计时读数；动画和交互仍使用真实时间。
    await page.clock.setFixedTime(new Date("2026-10-30T17:20:00+08:00"));
    await page.goto(base);
    await page.locator("[data-testid=board-page]").waitFor();
    await capture(page, `${prefix}-board`);

    if (mobile) {
      await page.locator("[data-testid=suspended-row] .row-main").first().tap();
    } else {
      await page.locator("[data-testid=active-row] .row-main").click();
    }
    await page.locator("[data-testid=detail-panel].open").waitFor();
    await capture(page, `${prefix}-detail`);
    if (mobile) await page.getByRole("button", { name: "关闭", exact: true }).click();
    else await page.locator("[data-testid=detail-close]").click();

    if (mobile) await page.getByRole("button", { name: "稿库", exact: true }).click();
    else await page.locator("[data-testid=lib-rail]").click();
    await page.locator("[data-testid=lib-panel].open").waitFor();
    await capture(page, `${prefix}-drawer`);
    // 重新载入恢复同一演示库，避免截图操作影响后续画面。
    await page.goto(base);
    await page.locator("[data-testid=board-page]").waitFor();
    const tab = async (name, index) => mobile
      ? page.locator(".m-tab").nth(index).click()
      : page.locator(`[data-testid=tab-${name}]`).click();
    await tab("stats", 1);
    await page.locator("[data-testid=month-cal]").waitFor();
    await capture(page, `${prefix}-month`);
    await page.locator("[data-testid=capsule-day]").click();
    await page.locator("[data-testid=daygrid-scroll]").waitFor();
    await page.waitForTimeout(800);
    // 日视角的进场锚点用于连续浏览；产品图展示完整的当天网格。
    await page.locator('[data-testid=day-unit][data-day="2026-10-30"]').evaluate((el) => el.scrollIntoView({ block: "start" }));
    await capture(page, `${prefix}-day`);
    await tab("settings", 2);
    await page.locator("[data-testid=settings-page]").waitFor();
    if (mobile) {
      // 手机设置页没有分组侧栏，按内容滚动到同步组。
      await page.locator('[data-sec="sync"]').evaluate((el) => el.scrollIntoView({ block: "start" }));
    } else {
      await page.locator("[data-testid=chip-sync]").click();
    }
    await capture(page, `${prefix}-sync`);

    await page.goto(`${base}/?theme=dark`);
    await page.locator("[data-testid=board-page]").waitFor();
    await capture(page, `${prefix}-dark`);
    await context.close();
  }
  if (errors.length) throw new Error(errors.join("\n"));
  writeFileSync(`${out}/capture.json`, JSON.stringify({
    source: "Vite browser preview with mock data; Android user agent selects MobileShell",
    nativeBridges: "Tauri event listener and Kotlin Keeper are no-op preview substitutes; native behavior is not tested",
    date: "2026-10-30T17:20:00+08:00",
    desktopViewport: [1200, 800], mobileViewport: [412, 915],
    screenshots: captures.map((name) => `${name}.png`),
    pageErrors: errors,
  }, null, 2) + "\n");
  console.log(`完成：${captures.length} 张截图，页面错误 ${errors.length}`);
} finally {
  await browser.close();
}
