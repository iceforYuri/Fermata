import { useEffect, useMemo, useRef, useState } from "react";
import { data } from "../api/data";
import { system } from "../api/system";
import { markHex, sliceMs, useBoard } from "../store/board";
import { switchTo } from "../store/actions";
import { fmtDur } from "../util";

type Phase =
  | { kind: "pick" }
  | { kind: "breakpoint"; targetPid: number; targetTitle: string; oldTitle: string };

/**
 * 切换浮层：输入行（过滤/新建二合一）→ 当前进程上下文（环读数副本）→ 等AI 组 → 挂起队列。
 * 1–9 直选 / ↑↓ / Enter=切换（断点内嵌两次回车）/ Esc 收起 / A 切换等AI。
 */
export function SwitcherPage() {
  const board = useBoard();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [bpText, setBpText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [phase]);

  const b = board.board;
  const running = b?.running ?? null;
  const waiting = (b?.suspended ?? []).filter((p) => p.process.state === "waiting_ai");
  const plain = (b?.suspended ?? []).filter((p) => p.process.state !== "waiting_ai");
  const all = [...waiting, ...plain];
  const filtered = all.filter((p) =>
    p.process.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const createMode = query.trim() !== "" && filtered.length === 0;

  const ringLeftMin = useMemo(() => {
    if (!running) return null;
    const slice = sliceMs(board);
    const elapsed =
      running.ring_elapsed_ms + (running.timer_open ? Date.now() - board.fetchedAt : 0);
    return Math.max(0, Math.ceil((slice - elapsed) / 60_000));
  }, [running, board]);

  const hide = () => void system.hideSwitcher();

  const doSwitch = async (targetPid: number | null, title: string | null) => {
    // 断点内嵌：Enter 瞬间输入行原位变形；再 Enter 确认走人；Esc 取消整个切换
    const oldTitle = running?.process.title ?? "";
    if (targetPid === null && title) {
      // 新建并切换（休息态中 = 显式开工：先 rest_end）
      const pid = await data.processCreate(title, undefined, b?.day);
      if (board.rest.resting) await data.restEnd(running?.process.id);
      await switchTo(pid);
      hide();
      return;
    }
    if (targetPid === null) return;
    // 预填当前生效断点（自动或钉住的手动），Enter=采纳
    setBpText(running?.breakpoint_effective ?? "");
    setPhase({ kind: "breakpoint", targetPid, targetTitle: title ?? "", oldTitle });
  };

  const confirmSwitch = async () => {
    if (phase.kind !== "breakpoint") return;
    // 断点双层：采纳预填=不动；清空=回自动；改写=手动钉住
    const oldEffective = running?.breakpoint_effective ?? "";
    const txt = bpText.trim();
    if (running) {
      if (txt === "" && oldEffective !== "" && running.breakpoint_manual) {
        await data.breakpointClear(running.process.id);
      } else if (txt !== "" && txt !== oldEffective) {
        await data.breakpointSet(running.process.id, txt);
      }
    }
    // 休息态中显式切换 = 第三条恢复路径（等价"翻下一篇"）
    if (board.rest.resting) await data.restEnd(running?.process.id);
    await switchTo(phase.targetPid, undefined);
    setPhase({ kind: "pick" });
    setBpText("");
    hide();
  };

  const onKey = async (e: React.KeyboardEvent) => {
    if (phase.kind === "breakpoint") {
      if (e.key === "Enter") await confirmSwitch();
      if (e.key === "Escape") {
        setPhase({ kind: "pick" }); // 取消整个切换
        setBpText("");
      }
      return;
    }
    if (e.key === "Escape") return hide();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(s + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      if (createMode) await doSwitch(null, query.trim());
      else if (filtered[sel]) await doSwitch(filtered[sel].process.id, filtered[sel].process.title);
    } else if (/^[1-9]$/.test(e.key)) {
      const i = parseInt(e.key, 10) - 1;
      if (filtered[i]) await doSwitch(filtered[i].process.id, filtered[i].process.title);
    } else if (e.key === "a" || e.key === "A") {
      const row = filtered[sel];
      if (row) {
        await data.waitingAiSet(row.process.id, row.process.state !== "waiting_ai");
      }
    }
  };

  return (
    <div className="overlay-card" data-testid="switcher">
      {phase.kind === "pick" ? (
        <input
          ref={inputRef}
          className="switcher-input"
          data-testid="switcher-input"
          placeholder="切换进程：打字即筛，1–9 直选"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSel(0);
          }}
          onKeyDown={onKey}
        />
      ) : (
        <input
          ref={inputRef}
          className="switcher-input"
          data-testid="switcher-bp-input"
          placeholder={`给「${phase.oldTitle}」留个断点（可空）↵`}
          value={bpText}
          onChange={(e) => setBpText(e.target.value)}
          onKeyDown={onKey}
        />
      )}

      {running && (
        <div className="switcher-current" data-testid="switcher-current">
          <span
            className="sw-spine"
            style={{ background: markHex(board, running.process.color_tag) ?? "var(--hairline)" }}
          />
          <span className="sw-title">{running.process.title}</span>
          <span className="sw-run">运行中</span>
          {ringLeftMin !== null && <span className="num sw-ring">环 {ringLeftMin}m</span>}
        </div>
      )}

      <div className="switcher-list" data-testid="switcher-list">
        {createMode && (
          <div className="sw-row selected" data-testid="switcher-create">
            <span className="sw-spine" style={{ background: "transparent" }} />
            <span className="sw-title">新建「{query.trim()}」并切换</span>
          </div>
        )}
        {filtered.map((bp, i) => {
          const p = bp.process;
          const isWaiting = p.state === "waiting_ai";
          return (
            <div
              key={p.id}
              className={`sw-row${i === sel ? " selected" : ""}`}
              data-testid="switcher-row"
              data-pid={p.id}
              onClick={() => void doSwitch(p.id, p.title)}
            >
              <span
                className="sw-spine"
                style={{ background: markHex(board, p.color_tag) ?? "var(--hairline)" }}
              />
              <span className="sw-title">
                {isWaiting && <span className="waiting-mark" style={{ background: markHex(board, p.color_tag) ?? "var(--ink-faint)" }} />}
                {p.title}
              </span>
              <span className="sw-bp">{p.breakpoint ?? ""}</span>
              <span className="aging-label">挂 {fmtDur(bp.aging_ms ?? 0)}</span>
              <span className="sw-key num">{i + 1 <= 9 ? i + 1 : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
