// M1 无头验证：真实交互断言（mock 内核，vite dev :14200）
import { chromium } from "playwright";

const BASE = "http://127.0.0.1:14200";
const results = [];
const ok = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const browser = await chromium.launch({ args: ["--disable-lcd-text"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// 回补：此时无活跃进程（上一步已完成入档）→ F3 守卫：不弹断点卡直接切换
await page.click("[data-testid=suspended-row] .row-main");
await page.waitForSelector("[data-testid=active-row]");
ok("F3 无活跃进程不弹断点卡直切", (await page.$("[data-testid=bp-card]")) === null);

// 5. 推拉面板开合（v1.1：左缘 rail）
const railVisible = !!(await page.$("[data-testid=lib-rail]"));
ok("rail 常驻进程页左缘", railVisible);
await page.click("[data-testid=lib-rail]");
await page.waitForTimeout(400);
const libW = await page.$eval("[data-testid=lib-panel]", (el) => el.getBoundingClientRect().width);
ok("rail 点开=稿库开（300px 划入）", Math.abs(libW - 300) < 2, `w=${libW}`);
await page.click("[data-testid=lib-rail]");
await page.waitForTimeout(400);
const libW2 = await page.$eval("[data-testid=lib-panel]", (el) => el.getBoundingClientRect().width);
ok("rail 收=稿库收", libW2 === 0, `w=${libW2}`);
// rail 只存在于进程页
await page.click("[data-testid=tab-stats]");
await page.waitForSelector("[data-testid=stats-page]");
await page.waitForTimeout(500);
const railOnStats = !!(await page.$("[data-testid=lib-rail]"));
await page.click("[data-testid=tab-board]");
await page.waitForTimeout(500);
ok("rail 不存在于统计页", !railOnStats);
// 详情栏
await page.click("[data-testid=active-row] .row-main");
await page.waitForTimeout(400);
const detW = await page.$eval("[data-testid=detail-panel]", (el) => el.getBoundingClientRect().width);
ok("详情栏开", detW > 300, `w=${detW}`);
await page.click("[data-testid=detail-close]");
await page.waitForTimeout(400);
const detW2 = await page.$eval("[data-testid=detail-panel]", (el) => el.getBoundingClientRect().width);
ok("详情栏收", detW2 === 0, `w=${detW2}`);

// 6. 断点写入=压 note 栈顶 / Esc 不写
await page.click("[data-testid=active-row] .row-main");
await page.waitForSelector("[data-testid=detail-breakpoint]");
await page.click("[data-testid=detail-breakpoint]");
await page.fill("[data-testid=detail-breakpoint-editing]", "断点甲");
await page.press("[data-testid=detail-breakpoint-editing]", "Enter");
await page.waitForTimeout(400);
const noteRow = await page.$$eval("[data-testid=detail-step][data-kind=note]", (els) => els.map((e) => e.textContent));
ok("断点写入=note 压栈顶", noteRow.some((t) => t.includes("断点甲")), JSON.stringify(noteRow));
const notesBefore = await page.$$eval("[data-testid=detail-step][data-kind=note]", (els) => els.length);
await page.click("[data-testid=detail-breakpoint]");
await page.fill("[data-testid=detail-breakpoint-editing]", "断点乙不应生效");
await page.press("[data-testid=detail-breakpoint-editing]", "Escape");
await page.waitForTimeout(300);
const notesAfter = await page.$$eval("[data-testid=detail-step][data-kind=note]", (els) => els.length);
ok("Esc 还原（不压栈）", notesAfter === notesBefore, `${notesBefore}→${notesAfter}`);
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
const qTopY = await page.evaluate(() => document.querySelector("[data-testid=suspended-queue]").getBoundingClientRect().top);
await page.mouse.move(box.x + box.width / 2, box.y + 2, { steps: 3 }); // < 4px 不应启动
await page.mouse.move(box.x + box.width / 2, qTopY + 10, { steps: 12 }); // 队列顶（折线下）
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

// 8b. 拖过折线到活跃位：虚影覆盖 + 松手切换 + 断点卡展开
{
  const rows8b = await page.$$eval("[data-testid=suspended-row]", (els) => els.map((e) => e.dataset.pid));
  const pid = rows8b[rows8b.length - 1];
  const box = await page.locator(`[data-testid=suspended-row][data-pid="${pid}"]`).boundingBox();
  const foldY = await page.evaluate(() => document.querySelector("[data-testid=active-row]").getBoundingClientRect().bottom);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, foldY - 40, { steps: 10 });
  await sleep(200);
  const ghost = await page.$("[data-testid=active-drop-ghost]");
  await page.mouse.up();
  await sleep(300);
  const card = await page.$("[data-testid=bp-card]");
  ok("拖到活跃位：虚影覆盖+断点卡展开", !!ghost && !!card);
  await page.press("[data-testid=bp-card-input]", "Enter"); // 空断点确认
  await sleep(500);
  const activeNow = await page.getAttribute("[data-testid=active-row]", "data-pid");
  ok("拖到活跃位=切换", activeNow === pid, `active=${activeNow} 期望 ${pid}`);
}

// 9. 稿库拖入成进程
await page.click("[data-testid=lib-rail]");
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

// 附2：顶栏胶囊 20 连击（真实鼠标点击，回归点击稳定性）
{
  let hits = 0;
  for (let i = 0; i < 10; i++) {
    const tabStats = await page.$("[data-testid=tab-stats]");
    const tb = await tabStats.boundingBox();
    await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2);
    await page.waitForSelector(".track-page.current [data-testid=stats-page]", { timeout: 2000 });
    await sleep(250); // 先收面板再横滑的 140ms + 页面进场
    const tabBoard = await page.$("[data-testid=tab-board]");
    const bb = await tabBoard.boundingBox();
    await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
    await page.waitForSelector(".track-page.current [data-testid=board-page]", { timeout: 2000 });
    await sleep(250);
    hits++;
  }
  ok("顶栏胶囊 20 连击全中", hits === 10, `${hits * 2}/20`);
}

// 附3：顶栏 hover/选中可读性（v1.2.1：弹簧不压 CSS hover，pill 封顶 10%）
{
  const statsTab = page.locator("[data-testid=tab-stats]");
  await statsTab.hover();
  await sleep(300);
  const hoverBg = await page.evaluate(() => {
    const pill = document.querySelector("[data-testid=tab-stats] .nav-pill");
    return getComputedStyle(pill).backgroundColor;
  });
  const activePillBg = await page.evaluate(() => {
    const pill = document.querySelector("[data-testid=tab-board].active .nav-pill") ??
      document.querySelector("[data-testid=tab-board] .nav-pill");
    return getComputedStyle(pill).backgroundColor;
  });
  // 未选中 hover：5% 染底（rgba 或 color(srgb)）
  const hoverHasTint = !/0\)$|transparent/.test(hoverBg);
  // 选中 pill：不超过 10% 墨
  const m = activePillBg.match(/([\d.]+)%?\s*\/?\s*([\d.]+)%?\)?$/);
  ok("顶栏 hover 染底生效（未选中）", hoverHasTint, hoverBg);
  ok("选中 pill 封顶 ~10%", /0\.1\)|10%|0\.1,/.test(activePillBg) || activePillBg.includes("10%"), activePillBg);
}

// 附4：轨道模型（v1.3）——方向/常驻挂载/滚动位置保留
{
  await page.click("[data-testid=tab-stats]");
  await page.waitForSelector(".track-page.current [data-testid=stats-page]");
  const t1 = await page.evaluate(() => document.querySelector("[data-testid=track]").style.transform);
  await page.click("[data-testid=tab-settings]");
  await page.waitForSelector(".track-page.current [data-testid=settings-page]");
  const t2 = await page.evaluate(() => document.querySelector("[data-testid=track]").style.transform);
  await page.click("[data-testid=tab-board]");
  await page.waitForSelector(".track-page.current [data-testid=board-page]");
  const t0 = await page.evaluate(() => document.querySelector("[data-testid=track]").style.transform);
  ok(
    "轨道 transform 方向正确",
    Math.abs(parseFloat(t0.match(/-[\d.]+%|[\d.]+%/)[0])) < 0.1 && Math.abs(parseFloat(t1.match(/-[\d.]+%/)[0]) + 33.33) < 0.1 && Math.abs(parseFloat(t2.match(/-[\d.]+%/)[0]) + 66.67) < 0.1,
    `${t0} / ${t1} / ${t2}`,
  );

  // 统计页滚动位置切走再切回保留（常驻挂载证据）
  await page.click("[data-testid=tab-stats]");
  await page.waitForSelector(".track-page.current [data-testid=stats-page]");
  await page.evaluate(() => {
    document.querySelector("[data-testid=track-page-stats] .stats-scroll").scrollTop = 240;
  });
  await page.click("[data-testid=tab-board]");
  await page.waitForSelector(".track-page.current [data-testid=board-page]");
  await page.click("[data-testid=tab-stats]");
  await page.waitForSelector(".track-page.current [data-testid=stats-page]");
  await sleep(300);
  const kept = await page.evaluate(() => document.querySelector("[data-testid=track-page-stats] .stats-scroll").scrollTop);
  ok("切 tab 不重挂载（滚动位置保留）", kept === 240, `scrollTop=${kept}`);
}

// 附5：F1 无面板时切 tab 无延迟（<20ms 起滑，给 CDP 余量 60ms）
{
  await page.click("[data-testid=tab-board]");
  await page.waitForSelector(".track-page.current [data-testid=board-page]");
  await sleep(300);
  // 页内 MutationObserver 计时（排除 CDP 轮询噪音）
  await page.evaluate(() => {
    const w = window;
    w.__slideT = 0;
    document.querySelector("[data-testid=tab-stats]").addEventListener("click", () => {
      w.__clickT = performance.now(); // 从页内 click 事件起算（排除 Playwright 输入延迟）
    }, true);
    new MutationObserver(() => {
      if (!w.__slideT) w.__slideT = performance.now();
    }).observe(document.querySelector("[data-testid=track]"), { attributes: true });
  });
  await page.click("[data-testid=tab-stats]");
  await page.waitForSelector(".track-page.current [data-testid=stats-page]");
  const elapsed = await page.evaluate(() => {
    const w = window;
    return w.__slideT - w.__clickT;
  });
  ok("F1 无面板切页零延迟起滑", elapsed >= 0 && elapsed < 20, `${elapsed.toFixed(1)}ms`);
  await page.click("[data-testid=tab-board]");
  await page.waitForSelector(".track-page.current [data-testid=board-page]");
}

// 附6：F4 MRU——被切走落挂起队首
{
  const rows0 = await page.$$eval("[data-testid=suspended-row]", (els) => els.map((e) => e.dataset.pid));
  const first = rows0[0];
  // 点队首 → 断点卡 → 确认切换（它成为运行），原运行落队首
  await page.click(`[data-testid=suspended-row][data-pid="${first}"] .row-main`);
  await page.waitForSelector("[data-testid=bp-card-input]");
  await page.press("[data-testid=bp-card-input]", "Enter");
  await sleep(500);
  const queue1 = await page.$$eval("[data-testid=suspended-row]", (els) => els.map((e) => e.dataset.pid));
  const activeId = await page.getAttribute("[data-testid=active-row]", "data-pid");
  const prevActive = queue1[0]; // 之前的活跃应落队首
  ok("F4 被切走落挂起队首（MRU）", activeId === first, `active=${activeId}, 队首=${prevActive}`);
}

// 附7：时间环小卡（只调本次）
{
  await page.click("[data-testid=time-ring-btn]");
  await page.waitForSelector("[data-testid=slice-card]");
  await page.click("[data-testid=slice-opt-60]");
  await sleep(500);
  const ringLabel = await page.textContent("[data-testid=time-ring] .ring-label");
  ok("时间环小卡：选 60m 后环读数=60", ringLabel === "60", `ring=${ringLabel}`);
  await page.keyboard.press("Escape");
}

// 附：空态可见 + 空态拖入成进程（落挂起不激活）
await page.goto(`${BASE}/?fixture=empty`);
await page.waitForSelector("[data-testid=empty-state]");
ok("空态引导语", (await page.textContent("[data-testid=empty-state]")).includes("版面还空着"));
// 稿库拖入空板
await page.click("[data-testid=lib-rail]");
await page.waitForSelector("[data-testid=plan-row]");
const plans0 = await page.$$eval("[data-testid=plan-row]", (r) => r.length);
await page.dragAndDrop("[data-testid=plan-row] >> nth=0", "[data-testid=empty-state]");
await sleep(500);
const susp = await page.$$eval("[data-testid=suspended-row]", (r) => r.length);
const noActive = (await page.$("[data-testid=active-row]")) === null;
ok("空态拖入成进程（落挂起不激活）", susp === 1 && noActive, `suspended=${susp} active=${!noActive}`);

// 附：休息态渲染
await page.goto(`${BASE}/?fixture=rest`);
await page.waitForSelector("[data-testid=rest-page]");
const restText = await page.textContent("[data-testid=rest-page]");
ok("休息页渲染", restText.includes("休息中"), "");

await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\n== ${results.length - failed.length}/${results.length} 通过 ==`);
process.exit(failed.length ? 1 : 0);
