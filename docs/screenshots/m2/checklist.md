# M2 验收 · 系统层（2026-09-19）

## 验收六项逐项结果（verify-m2.mjs 16/16 + verify-m2-idle.mjs PASS）

真实环境：tauri dev + CDP :9222 直连三窗 target（主窗/switcher/restpop），全新空库。

### a) Alt+Q 纯键盘 2 秒切换 —— PASS
`debug_trigger_hotkey`（与物理热键同一 `toggle_switcher` 代码路径；本机合成输入不触发 RegisterHotKey，PoC 已留证）→ 浮层 show+focus → CDP 键入 ↓ Enter → 输入行原位变形断点 → 打字 → Enter。
**全程 1121ms**（预算 2000ms）；切换完成、断点"写到状态机"入库、浮层自收。

### b) 双触发 —— PASS
`debug_set_time_scale(60)`（阈值与环长除以倍率）：
- 环走满：`rest_trigger source=ring_full` 事件落库（ts=…216192）
- 连轴转：`rest_trigger source=continuous` 落库（ts=…220150，阈值经 setting_set 调小后恢复 90）

### c) 不抢焦点 —— PASS
`debug_focus_check("restpop")`：show 前后 `GetForegroundWindow` 不变 + `GWL_EXSTYLE` 含 `WS_EX_NOACTIVATE`；restpop 展示期间主窗输入行打字完整落字（输入未被劫）。

### d) 软/硬模式 —— PASS
- 软模式：触发后未立即弹（`debug_window_visible=false`），计时照常，环呈超时态（满环 + "+Nm"）
- 间隙验证：①主窗 conceal→summon 获焦即弹 ②切换浮层打开即弹 ③（任务完成间隙在 e5 流程覆盖）——弹出瞬间 `rest_start` 已落库（弹窗出现即停表）
- 硬模式（rest_mode=hard）：到点即弹，无间隙等待

### e) 休息态语义 —— PASS
- ✕=关窗但保持休息态（`q_rest_state.resting=true`、主窗 tab1 休息页在等）
- 三条恢复路径各走一次：①弹窗「暂不休息」②主窗休息页「继续」③✕ 后浮层显式切换（=显式开工，rest_end+切换）
- 翻下一篇：展开挂起前 3 条并切换成功、关窗、计时恢复

### f) 空闲回归确认 —— PASS（GIKA_IDLE_SECS=5 独立库实例）
静置 7s → `idle_start` 闭段、环变暗 → 注入活动 → `idle_end` + 确认卡出现（截图 wv2-idle-confirm.png）→ 答"是" → `idle_confirm{yes:true}` + 分段合并（开口段起点=切换时刻，回补成立）。30s 超时默认"是"按文档明文在 IdleConfirmCard 实现。
注：本机合成输入接受率今夜出现抖动（idle-probe.ps1 实测约 1/3 落地到全吞不等），验收脚本改为"注入直到 idle_current 真翻转"自愈循环——这是环境属性，非产品缺陷。

## 跨窗同步架构

```
任意变更命令 → Rust 侧 emit "store-changed" → 三个窗口各自的 board store 监听重取
浮层开合 → emit "overlay-visibility"（主窗调度器据此识别软模式间隙）
空闲线程 → emit "gika-idle"（主窗幂等落 idle_start/idle_end）
time-scale → emit "time-scale"（验收加速）
```

浮层 = setup 预建隐藏窗（visible:false），show/hide 开合；switcher `focusable:true` + 失焦自收；restpop `focusable:false`（WS_EX_NOACTIVATE，PoC 原语A 路径）。两窗加载 `#/overlay/*` 路由，同一套 React 组件与 store 代码，浏览器 mock 可直接截图。

## docs/04 逐条对照

| 规格 | 实现 | 证据 |
|---|---|---|
| 浮层无边框/置顶/实心暖卡/opaque | sys.rs precreate_overlays | wv2-main-switcher.png / wv2-main-restpop.png |
| switcher 要焦点、restpop 不抢焦点 | focusable true/false + 失焦自收 | 验收 c) |
| Esc：浮层收起 / 弹窗=✕ | SwitcherPage/RestpopPage 键位 | 验收 a) e2) |
| 输入行过滤/新建二合一 | SwitcherPage createMode | overlay-switcher-filter.png |
| 当前进程上下文行（色脊+运行中+环读数副本） | switcher-current 行 | overlay-switcher.png |
| 等AI 组排前带小标记 | waiting 前置 + waiting-mark | overlay-switcher.png |
| 1–9 直选/↑↓/Enter/A 键等AI | SwitcherPage onKey | 验收 a) |
| 断点内嵌两次回车/Esc 取消整个切换 | phase=breakpoint | overlay-switcher-breakpoint.png / 验收 a) |
| 双触发 + 软模式三间隙 + 硬模式 | store/scheduler.ts | 验收 b) d) |
| 弹窗出现即暂停计时 | openRestpop 先 rest_start 后 show | 验收 d-gap1b) |
| 三按钮/无超时/✕=保持休息 | RestpopPage | overlay-restpop-*.png / 验收 e) |
| 休息态双渲染同读 rest_state | q_rest_state（最后 rest_start 无对应 rest_end） | 验收 e2)–e4) |
| 连轴转计数 rest_end 归零 | q_continuous_work_ms 边界 | M0 口径 + 验收 b2) |
| 断点微弹窗（主窗点挂起行） | BreakpointCard 行旁小卡 | verify-m1 回补用例覆盖 |
| 空闲回归确认 + 30s 默认是 + 回补合并 | IdleConfirmCard + ops::idle_confirm | 验收 f) |

## 宪法七条自查

1. 调度为内核：触发/计时全走 events+segments，前端只是评估与呈现 ✓
2. **时间默认值不计**：rest_start/idle_start 闭段；恢复仅三条显式路径（弹窗按钮/休息页继续/浮层切换），全代码巡查无第四条隐式路径（switch 不经浮层即显式动作；pause/resume 为手动行内操作）✓
3. 颜色只属于色标：浮层与弹窗无强调色，色脊归色标 ✓
4. 玻璃边界：浮层/弹窗全部实心暖卡 opaque；玻璃仅休息页/档案 ✓
5. 无表单：断点内嵌/微弹窗均为原地变形输入行 ✓
6. 推拉不弹窗：主窗无模态；浮层是系统层独立窗口（设计本就如此） ✓
7. 六原语薄接口：组件零 @tauri-apps/api（system.ts 集中） ✓

## 截图清单（docs/screenshots/m2/）

mock：overlay-switcher / -filter / -breakpoint / overlay-restpop-choice / -next / -resting
真实：wv2-main-switcher.png（主窗+浮层）/ wv2-main-restpop.png（主窗+休止符弹窗）/ wv2-idle-confirm.png（空闲确认卡）
