import { setUi } from "../store/ui";

/** 空态：排版好的引导语 + 两个入口。拖放感应在中列级（BoardPage），空板松手=直接激活。 */
export function EmptyState() {
  return (
    <div className="empty-state" data-testid="empty-state">
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
