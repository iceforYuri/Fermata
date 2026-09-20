// v12 拖放重构截图：① 进程行拖拽中帧（塌陷补位+开缝虚影）② 稿库拖入预览帧（中列感应虚影）
import { chromium } from "playwright";
const BASE = "http://127.0.0.1:14200";
const OUT = "docs/screenshots/v12";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
await page.goto(BASE);
await page.waitForSelector("[data-testid=suspended-row]");
await sleep(400);

// ① 进程行拖拽中帧：拖第 2 行过第 3 行中点 → 第 3 行补位上移、缝位虚影
{
  const rows = await page.$$("[data-testid=suspended-row]");
  const pids = await page.$$eval("[data-testid=suspended-row]", (els) => els.map((e) => e.dataset.pid));
  const box = await rows[1].boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy + 40, { steps: 8 });
  await sleep(450); // 弹簧到位
  await page.screenshot({ path: `${OUT}/drag-ghost-frame.png` });
  console.log("saved drag-ghost-frame.png  (row2 dragged, row3 collapsed up)");
  await page.mouse.up();
  await sleep(500);
}

// ② 稿库拖入预览帧：稿库开，dragover 到队列中部 → 开缝 + 虚影
{
  await page.click("[data-testid=lib-rail]");
  await page.waitForSelector("[data-testid=plan-row]");
  const q = await page.locator("[data-testid=suspended-queue]").boundingBox();
  const tx = q.x + q.width / 2, ty = q.y + 90; // 队列中部
  await page.evaluate(([x, y]) => {
    const dt = new DataTransfer();
    dt.setData("text/gika-plan", "{}");
    document.querySelector("[data-testid=board-page]").dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }),
    );
  }, [tx, ty]);
  await sleep(450);
  await page.screenshot({ path: `${OUT}/lib-drag-preview.png` });
  console.log("saved lib-drag-preview.png  (library open, ghost in queue gap)");
}

await browser.close();
