// M1 无头验证：真实交互断言（mock 内核，vite dev :14200）
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:14200";
const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto(`${BASE}/`);
await page.waitForSelector("[data-testid=board-page]");

// 1. 就地勾选推进：勾第一个未完成步骤 → 当前步骤推进到下一个
const before = await page.textContent("[data-testid=current-step]");
await page.click("[data-testid=step-check]");
await page.waitForTimeout(400);
const after = await page.textContent("[data-testid=current-step]");
ok(
  "就地勾选推进",
  before.includes("集成测试") && after.includes("一周种子"),
  `${before.trim()} → ${after.trim()}`,
);

// 2. 完成 → 3s 内撤销 → 撤销成功（回到运行态）
const activePid = await page.getAttribute("[data-testid=active-row]", "data-pid");
await page.click("[data-testid=active-row] [data-testid=confirm-spine]");
await page.waitForSelector("[data-testid=undo-toast]");
await page.click("[data-testid=undo-btn]");
await page.waitForTimeout(400);
const backPid = await page.getAttribute("[data-testid=active-row]", "data-pid");
ok("完成→3s 撤销→撤销成功", backPid === activePid);

// 3. 完成 → 超时入档案
await page.click("[data-testid=active-row] [data-testid=confirm-spine]");
await page.waitForSelector("[data-testid=undo-toast]");
await page.waitForTimeout(3400); // toast 3s 生命周期
const toastGone = (await page.$("[data-testid=undo-toast]")) === null;
const donebarText = await page.textContent("[data-testid=donebar]");
ok("完成→超时入档案", toastGone && donebarText.includes("3 件"), donebarText.trim());

// 4. 档案重开回挂起队尾
await page.click("[data-testid=donebar]");
await page.waitForSelector("[data-testid=archive]");
const firstArchive = await page.$$eval("[data-testid=archive-row]", (rows) =>
  rows.map((r) => r.dataset.pid),
);
const reopenPid = firstArchive[firstArchive.length - 1]; // 最近完成的在末尾
await page.click(`[data-testid=archive-row][data-pid="${reopenPid}"] [data-testid=archive-reopen]`);
await page.waitForTimeout(400);
await page.click("[data-testid=archive]", { position: { x: 20, y: 700 } });
const queuePids = await page.$$eval("[data-testid=suspended-row]", (rows) =>
  rows.map((r) => r.dataset.pid),
);
ok("档案重开回队尾", queuePids[queuePids.length - 1] === reopenPid, `queue=[${queuePids}]`);

// 回补：点队列首行 → 断点小卡 → Enter 确认切换
await page.click("[data-testid=suspended-row] .row-main");
await page.waitForSelector("[data-testid=bp-card-input]");
await page.press("[data-testid=bp-card-input]", "Enter");
await page.waitForSelector("[data-testid=active-row]");

// 5. 推拉面板开合
await page.click("[data-testid=lib-toggle]");
await page.waitForTimeout(400);
const libW = await page.$eval("[data-testid=lib-panel]", (el) => el.getBoundingClientRect().width);
ok("稿库开（300px 划入）", Math.abs(libW - 300) < 2, `w=${libW}`);
await page.click("[data-testid=lib-toggle]");
await page.waitForTimeout(400);
const libW2 = await page.$eval("[data-testid=lib-panel]", (el) => el.getBoundingClientRect().width);
ok("稿库收", libW2 === 0, `w=${libW2}`);
// 详情栏
await page.click("[data-testid=active-row] .row-main");
await page.waitForTimeout(400);
const detW = await page.$eval("[data-testid=detail-panel]", (el) => el.getBoundingClientRect().width);
ok("详情栏开", detW > 300, `w=${detW}`);
await page.click("[data-testid=detail-close]");
await page.waitForTimeout(400);
const detW2 = await page.$eval("[data-testid=detail-panel]", (el) => el.getBoundingClientRect().width);
ok("详情栏收", detW2 === 0, `w=${detW2}`);

// 6. 双态编辑：详情栏断点 Enter 提交 / Esc 还原
await page.click("[data-testid=active-row] .row-main");
await page.waitForSelector("[data-testid=detail-breakpoint]");
await page.click("[data-testid=detail-breakpoint]");
await page.fill("[data-testid=detail-breakpoint-editing]", "断点甲");
await page.press("[data-testid=detail-breakpoint-editing]", "Enter");
await page.waitForTimeout(300);
const bpText = await page.textContent("[data-testid=detail-breakpoint]");
ok("双态编辑·Enter 提交", bpText.includes("断点甲"), bpText.trim());
await page.click("[data-testid=detail-breakpoint]");
await page.fill("[data-testid=detail-breakpoint-editing]", "断点乙不应生效");
await page.press("[data-testid=detail-breakpoint-editing]", "Escape");
await page.waitForTimeout(300);
const bpText2 = await page.textContent("[data-testid=detail-breakpoint]");
ok("双态编辑·Esc 还原", bpText2.includes("断点甲"), bpText2.trim());
await page.click("[data-testid=detail-close]");

// 7. 新建落队尾
const qBefore = await page.$$eval("[data-testid=suspended-row]", (r) => r.length);
await page.fill("[data-testid=new-row-input]", "验证用新进程");
await page.press("[data-testid=new-row-input]", "Enter");
await page.waitForTimeout(400);
const rows = await page.$$eval("[data-testid=suspended-row]", (els) =>
  els.map((e) => e.querySelector(".suspended-title").textContent),
);
ok(
  "新建落队尾",
  rows.length === qBefore + 1 && rows[rows.length - 1] === "验证用新进程",
  rows[rows.length - 1] ?? "",
);

// 8. 拖拽排序（4px 阈值）：把队尾拖到队首
const before8 = await page.$$eval("[data-testid=suspended-row]", (els) =>
  els.map((e) => e.dataset.pid),
);
const last = `[data-testid=suspended-row][data-pid="${before8[before8.length - 1]}"]`;
const box = await page.locator(last).boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + 2, { steps: 3 }); // < 4px 不应启动
await page.mouse.move(box.x + box.width / 2, box.y - 340, { steps: 12 }); // 越过队首
await page.waitForTimeout(150);
await page.mouse.up();
await page.waitForTimeout(400);
const after8 = await page.$$eval("[data-testid=suspended-row]", (els) =>
  els.map((e) => e.dataset.pid),
);
ok(
  "拖拽排序（队尾→队首）",
  after8[0] === before8[before8.length - 1],
  `[${before8}] → [${after8}]`,
);

// 9. 稿库拖入成进程
await page.click("[data-testid=lib-toggle]");
await page.waitForSelector("[data-testid=plan-row]");
const planCount = await page.$$eval("[data-testid=plan-row]", (r) => r.length);
const qCount9 = await page.$$eval("[data-testid=suspended-row]", (r) => r.length);
await page.dragAndDrop(
  "[data-testid=plan-row] >> nth=0",
  "[data-testid=suspended-queue]",
);
await page.waitForTimeout(500);
const planCount2 = await page.$$eval("[data-testid=plan-row]", (r) => r.length);
const qCount92 = await page.$$eval("[data-testid=suspended-row]", (r) => r.length);
ok(
  "稿库拖入成进程",
  planCount2 === planCount - 1 && qCount92 === qCount9 + 1,
  `plans ${planCount}→${planCount2}, queue ${qCount9}→${qCount92}`,
);

// 附：空态可见
await page.goto(`${BASE}/?fixture=empty`);
await page.waitForSelector("[data-testid=empty-state]");
ok("空态引导语", (await page.textContent("[data-testid=empty-state]")).includes("版面还空着"));

// 附：休息态渲染
await page.goto(`${BASE}/?fixture=rest`);
await page.waitForSelector("[data-testid=rest-page]");
const restText = await page.textContent("[data-testid=rest-page]");
ok("休息页渲染", restText.includes("休息中"), "");

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n== ${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
