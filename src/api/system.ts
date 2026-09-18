/**
 * 系统层六原语薄接口 —— 前端组件只允许经过这一层触达系统能力。
 * 唤出 / 隐藏 / 置顶 / 焦点 / 空闲 / 热键
 * 浏览器（mock）环境下窗口控制为空操作。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./data";

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

const noop = () => Promise.resolve();
const noopListen = (_cb: (v: boolean) => void) => Promise.resolve(() => {});

export const system = {
  /** 唤出主窗（M2：全局浮层唤起；当前=聚焦主窗） */
  summon(): Promise<void> {
    return isTauri ? getCurrentWindow().setFocus() : noop();
  },
  /** 隐藏主窗（M2） */
  conceal(): Promise<void> {
    return isTauri ? getCurrentWindow().hide() : noop();
  },
  /** 置顶开关 */
  pin(on: boolean): Promise<void> {
    return isTauri ? getCurrentWindow().setAlwaysOnTop(on) : noop();
  },
  /** 窗口控制（自绘标题栏） */
  winMinimize(): Promise<void> {
    return isTauri ? getCurrentWindow().minimize() : noop();
  },
  winToggleMaximize(): Promise<void> {
    return isTauri ? getCurrentWindow().toggleMaximize() : noop();
  },
  winClose(): Promise<void> {
    return isTauri ? getCurrentWindow().close() : noop();
  },
  /** 焦点 · PoC 实证命令保留 */
  spawnPocPopup(): Promise<FocusTestResult> {
    return isTauri
      ? invoke<FocusTestResult>("poc_spawn_popup")
      : Promise.reject(new Error("浏览器环境无弹窗实证"));
  },
  /** 空闲：Rust 空闲线程广播 gika-idle 事件 */
  onIdleChange(handler: (idling: boolean) => void): Promise<UnlistenFn> {
    return isTauri
      ? listen<boolean>("gika-idle", (e) => handler(e.payload))
      : noopListen(handler);
  },
  /** 热键 · Alt+Q */
  onHotkey(handler: (combo: string) => void): Promise<UnlistenFn> {
    return isTauri
      ? listen<string>("poc-hotkey", (e) => handler(e.payload))
      : noopListen(handler as never);
  },
};
