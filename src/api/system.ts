/**
 * 系统层六原语薄接口 —— 前端组件只允许经过这一层触达系统能力。
 * 唤出 / 隐藏 / 置顶 / 焦点 / 空闲 / 热键
 * PoC 阶段只实现热键事件与焦点实证，其余留桩待 M2。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface FocusTestResult {
  beforeHwnd: string;
  beforeTitle: string;
  afterHwnd: string;
  afterTitle: string;
  exStyle: string;
  hasNoActivate: boolean;
  foregroundUnchanged: boolean;
  pass: boolean;
  log: string[];
}

export const system = {
  /** 唤出（M2 实现） */
  summon(): Promise<void> {
    return Promise.reject(new Error("未实现：M2"));
  },
  /** 隐藏（M2 实现） */
  conceal(): Promise<void> {
    return Promise.reject(new Error("未实现：M2"));
  },
  /** 置顶（M2 实现） */
  pin(): Promise<void> {
    return Promise.reject(new Error("未实现：M2"));
  },
  /** 焦点 · PoC 原语A：弹出不抢焦点的休止符小样并回传断言结果 */
  spawnPocPopup(): Promise<FocusTestResult> {
    return invoke<FocusTestResult>("poc_spawn_popup");
  },
  /** 空闲（M2 实现；PoC 阈值由 GIKA_IDLE_SECS 控制，证据见运行日志） */
  idleThresholdSecs(): Promise<void> {
    return Promise.reject(new Error("未实现：M2"));
  },
  /** 热键 · PoC 原语C：订阅 Alt+Q 触发事件 */
  onHotkey(handler: (combo: string) => void): Promise<UnlistenFn> {
    return listen<string>("poc-hotkey", (e) => handler(e.payload));
  },
};
