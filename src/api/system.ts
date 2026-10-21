/**
 * 系统层六原语薄接口 —— 组件只允许经这一层触达系统能力。
 * 唤出 / 隐藏 / 置顶 / 焦点 / 空闲 / 热键 + 浮层开合 + debug 替身。
 * 浏览器（mock）环境下均为空操作。
 */
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./data";
import { isMobile } from "../mobile";

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

/** 桌面系统层存在与否：移动端无六原语（热键/浮层/空闲），一律空操作 */
const hasSys = isTauri && !isMobile;

const noop = () => Promise.resolve();
const noopListen = (): Promise<UnlistenFn> => Promise.resolve(() => {});

function cmd<T>(name: string, args?: Record<string, unknown>): () => Promise<T> {
  return () => invoke<T>(name, args);
}
function cmdMock<T>(fallback?: T): Promise<T> {
  return Promise.resolve(fallback as T);
}

export const system = {
  /** 唤出主窗（解最小化 + show + focus） */
  summon: () => (hasSys ? invoke<void>("summon") : noop()),
  /** 隐藏主窗 */
  conceal: () => (hasSys ? invoke<void>("conceal") : noop()),
  /** 置顶开关（落 settings.always_on_top） */
  pin: (on: boolean) => (hasSys ? invoke<void>("pin", { on }) : noop()),
  /** 焦点：聚焦主窗 */
  focus: () => (hasSys ? invoke<void>("focus_main") : noop()),
  /** 当前空闲状态（挂载时对齐；事件只有沿） */
  idleCurrent: () => (hasSys ? invoke<boolean>("idle_current") : cmdMock(false)),
  /** 空闲事件流 */
  onIdleChange: (handler: (idling: boolean) => void): Promise<UnlistenFn> =>
    hasSys ? listen<boolean>("fermata-idle", (e) => handler(e.payload)) : noopListen(),
  /** 热键：后端注册/触发切换浮层；此事件供观测（hotkey-fired） */
  onHotkey: (handler: (combo: string) => void): Promise<UnlistenFn> =>
    hasSys ? listen<string>("hotkey-fired", (e) => handler(e.payload)) : noopListen(),
  /** 热键从 settings 重注册 */
  hotkeyApply: () => (hasSys ? invoke<void>("hotkey_apply") : noop()),

  /** 浮层开合 */
  showSwitcher: () => (hasSys ? invoke<void>("show_switcher") : noop()),
  hideSwitcher: () => (hasSys ? invoke<void>("hide_switcher") : noop()),
  showRestpop: () => (hasSys ? invoke<void>("show_restpop") : noop()),
  hideRestpop: () => (hasSys ? invoke<void>("hide_restpop") : noop()),
  onOverlayVisibility: (
    handler: (label: string, visible: boolean) => void,
  ): Promise<UnlistenFn> =>
    isTauri
      ? listen<{ label: string; visible: boolean }>("overlay-visibility", (e) =>
          handler(e.payload.label, e.payload.visible),
        )
      : noopListen(),

  /** 窗口控制（自绘标题栏） */
  winMinimize: () => (hasSys ? getCurrentWindow().minimize() : noop()),
  winToggleMaximize: () => (hasSys ? getCurrentWindow().toggleMaximize() : noop()),
  winClose: () => (hasSys ? getCurrentWindow().close() : noop()),

  /** 数据变更广播（跨窗同步） */
  onStoreChanged: (handler: () => void): Promise<UnlistenFn> =>
    hasSys ? listen("store-changed", handler) : noopListen(),

  /** debug 替身（验收用） */
  debugTriggerHotkey: () =>
    hasSys ? invoke<void>("debug_trigger_hotkey") : cmdMock(),
  debugSetTimeScale: (factor: number) =>
    hasSys ? invoke<number>("debug_set_time_scale", { factor }) : cmdMock(factor),
  debugGetTimeScale: () =>
    hasSys ? invoke<number>("debug_get_time_scale") : cmdMock(1),

  /** 时间倍率变更事件 */
  onTimeScale: (handler: (f: number) => void): Promise<UnlistenFn> =>
    hasSys ? listen<number>("time-scale", (e) => handler(e.payload)) : noopListen(),

  /** PoC 实证命令保留 */
  spawnPocPopup: cmd<FocusTestResult>("poc_spawn_popup"),
};
