import { useState } from "react";
import { data } from "../api/data";
import { act, todayStr } from "../store/board";

/** 中列底部一行式 + 号新建：回车即建、落挂起队列尾部 */
export function NewProcessRow() {
  const [v, setV] = useState("");
  const submit = () => {
    const title = v.trim();
    if (!title) return;
    setV("");
    void act(() => data.processCreate(title, undefined, todayStr()));
  };
  return (
    <div className="new-row" data-testid="new-row">
      <span className="plus">+</span>
      <input
        data-testid="new-row-input"
        value={v}
        placeholder="新进程，回车落挂起队列"
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
    </div>
  );
}
