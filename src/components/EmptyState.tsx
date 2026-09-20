import { data } from "../api/data";
import { act, todayStr } from "../store/board";
import { setUi } from "../store/ui";

/** 空态：排版好的引导语 + 两个入口 */
export function EmptyState() {
  // 空态放置区：空板无折线，拖入一律落挂起（不自动激活——时间默认值是不计）
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("text/gika-plan");
    if (!raw) return;
    e.preventDefault();
    const plan = JSON.parse(raw) as { id: number; title: string };
    void act(async () => {
      await data.processCreate(plan.title, undefined, todayStr());
      await data.planDelete(plan.id);
    });
  };

  return (
    <div
      className="empty-state"
      data-testid="empty-state"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("text/gika-plan")) e.preventDefault();
      }}
      onDrop={onDrop}
    >
      <p className="lead">
        今天的版面还空着。
        <br />
        一件事排进来，它就是头条。
      </p>
      <p>
        <span
          className="entry"
          data-testid="empty-open-library"
          onClick={() => setUi({ leftOpen: true })}
        >
          从稿库拖一件进来
        </span>
        <span
          className="entry"
          data-testid="empty-focus-new"
          onClick={() =>
            (document.querySelector("[data-testid=new-row-input]") as HTMLInputElement)?.focus()
          }
        >
          或在底部 + 号写下此刻最惦记的
        </span>
      </p>
    </div>
  );
}
