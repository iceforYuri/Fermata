import { useEffect, useState } from "react";
import { system } from "../api/system";

export default function HomePage() {
  const [hotkeys, setHotkeys] = useState<string[]>([]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    system
      .onHotkey((combo) =>
        setHotkeys((prev) => [...prev, `${new Date().toLocaleTimeString()} · ${combo}`]),
      )
      .then((fn) => (unlisten = fn))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  return (
    <main className="home">
      <h1>gika</h1>
      <p className="sub">PoC · 三原语验证骨架（进程页尚未排期）</p>
      <nav>
        <a href="#/rest">#/rest —— 休息页玻璃小样（原语B）</a>
        <a href="#/overlay/poc-popup-trigger">
          #/overlay/poc-popup-trigger —— 不抢焦点弹窗实证（原语A）
        </a>
      </nav>
      <section className="hotkey-log">
        <h2>热键事件 · Alt+Q（原语C）</h2>
        <ul data-testid="hotkey-log">
          {hotkeys.length === 0 ? (
            <li>尚未收到热键事件</li>
          ) : (
            hotkeys.map((h, i) => <li key={i}>{h}</li>)
          )}
        </ul>
      </section>
    </main>
  );
}
