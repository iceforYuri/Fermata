/** 会话通知桥（M2m）：仅移动端有效。内容由真实计时状态驱动；按钮事件回这里。 */
import { Channel, invoke } from "@tauri-apps/api/core";
import { isMobile } from "../mobile";

export interface KeeperSession {
  title: string;
  running: boolean;
  whenEpoch: number; // 计时的起始墙钟（chronometer 用）
  accumMs: number;   // 已暂停时累计
}

export const keeper = {
  update(s: KeeperSession) {
    if (!isMobile) return;
    void invoke("plugin:keeper|update", { title: s.title, running: s.running, whenEpoch: s.whenEpoch, accumMs: s.accumMs });
  },
  hide() {
    if (!isMobile) return;
    void invoke("plugin:keeper|update", { title: "", running: false, whenEpoch: 0, accumMs: 0 }); // 先空发；隐藏走 cancel——下一步补 hide 命令
  },
  scheduleReminder(atElapsedMs: number) {
    if (!isMobile) return;
    void invoke("plugin:keeper|schedule_reminder", { atElapsed: atElapsedMs });
  },
  cancelReminder() {
    if (!isMobile) return;
    void invoke("plugin:keeper|cancel_reminder");
  },
  /** 订阅通知按钮（暂停/继续）。返回退订。 */
  async onAction(cb: (action: "pause" | "resume") => void): Promise<() => void> {
    if (!isMobile) return () => {};
    const chan = new Channel<{ action: string }>();
    chan.onmessage = (msg) => {
      if (msg.action === "pause" || msg.action === "resume") cb(msg.action);
    };
    await invoke("plugin:keeper|register_listener", { event: "keeper-action", handler: chan });
    return () => {};
  },
};
