# PoC 证据汇总 · 三原语验证（2026-09-19）

环境：Windows 11 build 26200（125% DPI）、WebView2 Runtime 153.0.4234.32、tauri 2.11.5 / @tauri-apps/cli 2.11.4 / api 2.11.1、tauri-plugin-global-shortcut 2.3.2、user-idle 0.5.3、windows-sys 0.59、rustc 1.97.1（stable-x86_64-pc-windows-msvc）。全程 opaque 窗口，`tauri.conf.json` 无 `transparent`。

## 结论一览

| 原语 | 结论 | 证据 |
|---|---|---|
| A · 不抢焦点弹窗 | **PASS** | focus-test.log / wv2-focus.png / wv2-popup-desktop.png |
| B · 页内 backdrop-filter | **PASS（真实 WebView2 实测）** | wv2-rest.png / wv2-rest-noglass.png / wv2-verdicts.json |
| C · 热键 Alt+Q | **注册+接线 PASS；触发链路受环境限制，待人工按一次物理 Alt+Q 终验** | poc-runtime.log / hotkey-probe3·4·5.log |
| C · 空闲回调（GIKA_IDLE_SECS） | **PASS** | poc-runtime.log |
| 顺带 · Win11 DWM 自动圆角 | **PASS** | wv2-popup-desktop.png + 角像素采样（下详） |

---

## 原语A · 不抢焦点弹窗 —— PASS

命令：主窗 `#/overlay/poc-popup-trigger` 点击"触发展示弹窗" → `poc_spawn_popup`（Rust async command）以 `WebviewWindowBuilder` 建 420×280 弹窗（decorations off / always_on_top / **focusable false** / skip_taskbar），创建前后取 `GetForegroundWindow`，并读弹窗 `GWL_EXSTYLE`。

`focus-test.log` 摘录：

```
前台窗口（创建前）: hwnd=0x402b8 标题="Windows 默认锁屏界面"
前台窗口（创建后）: hwnd=0x402b8 标题="Windows 默认锁屏界面"
弹窗 GWL_EXSTYLE = 0x08040118
WS_EX_NOACTIVATE (0x08000000): 含
前台未易主: 是
[poc] focus-test PASS
```

- 0x08040118 & 0x08000000 ≠ 0 → **WS_EX_NOACTIVATE 在位**（tao `focusable:false` 源码级兑现）
- 前台句柄创建前后一致 → **未抢焦点**；页面同时展示断言表（wv2-focus.png），桌面截图可见实心暖卡弹窗真实出现（wv2-popup-desktop.png，左上角 420×280）
- 排障记录：同步 command 内建窗会死锁（command 占主线程、`build()` 需派发到主线程）——command 必须为 `async fn`；`focusable(false)` 须在建窗时设置（WS_EX_NOACTIVATE 创建即带）

## 原语B · 页内 backdrop-filter —— PASS（真实 WebView2）

方法：`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` 启动 `pnpm tauri dev`，Playwright `connectOverCDP("http://localhost:9222")` 直连真实 WebView2 内 `#/rest` 页。

实测输出（scripts/webview2-evidence.mjs）：

```
backdrop-filter computed = blur(20px) saturate(1.2)
原语B: 过渡带(玻璃开)=74px 过渡带(玻璃关)=46px 条纹心采样=222,161,136 vs 原色=180,83,47 => PASS
```

- `getComputedStyle` 确认 `blur(20px) saturate(1.2)` 在 WebView2 内生效
- 像素级证明模糊真实发生：跨条纹边界采样，玻璃开启时过渡带 74px（模糊把相邻条纹颜色摊开），临时关闭 backdrop-filter 后收缩到 46px（仅卡片间隙的固有过渡）；条纹中心采样色 (222,161,136) ≠ 任一条纹原色（如 180,83,47）——是底层条纹经模糊+半透暖白的混合色
- 截图：wv2-rest.png（玻璃态）/ wv2-rest-noglass.png（对照）/ dev-rest.png（Chromium dev server 对照）

## 原语C · 热键 Alt+Q —— 注册/接线 PASS，触发链路受环境限制

已验证：
- 注册成功：`[poc] hotkey alt+q registered`（poc-runtime.log）；处理器收到 Pressed 时会打 `[poc] hotkey alt+q fired` 并 emit `poc-hotkey` 到前端（前端 `#/` 页有事件列表）

受限点（诚实记录）：本机**一切注入式输入都不触发 RegisterHotKey**。三条注入路径全部试过且全部失败：
SendKeys（WScript.Shell）、keybd_event、SendInput（扫描码，8/8 成功送达）、WinRT InputInjector（跨进程）。
为排除 gika/Tauri 嫌疑，写了独立 Win32 探针（scripts/hotkey-probe5.ps1）：纯 WinForms 进程 `RegisterHotKey(Ctrl+Alt+Shift+O)` 返回 True，另一进程注入同组合键，8 秒内无 WM_HOTKEY —— **与 gika 无关，是这台机器（Windows 11 26200，疑系统行为变更或安全软件过滤合成输入）的环境属性**，换 Electron 也一样。
对照事实：注入输入在 OS 层是到达的（CapsLock 翻转、GetLastInputInfo 空闲计时被重置），仅热键匹配路径不响应合成输入。

- 探针日志：hotkey-probe3.log（keybd_event）、hotkey-probe4.log（SendInput sent=8/8）、hotkey-probe5.log（跨进程 WinRT）
- **待人工终验**：dev 运行时物理按一次 Alt+Q，poc-runtime.log 应出现 `[poc] hotkey alt+q fired`，`#/` 页热键列表出现条目。物理按键走硬件输入路径，不受上述过滤影响
- 注：Alt+Q 被注册后全局独占（探针尝试重复注册返回 err=1409 ERROR_HOTKEY_ALREADY_REGISTERED，反向佐证注册真实持有）

## 原语C · 空闲回调 —— PASS

`GIKA_IDLE_SECS=5 pnpm tauri dev`，user-idle 每秒轮询。poc-runtime.log 摘录（毫秒时间戳）：

```
[1789753967073] [poc] idle end        ← 注入一次 Ctrl（重置系统空闲计时）
[1789753972077] [poc] idle begin (>=5s) ← 静置 5s 后
[1789754025106] [poc] idle end        ← 再次注入 Ctrl
[1789754030109] [poc] idle begin (>=5s) ← 再静置
```

状态机按 进入→退出→再进入 循环正确翻转。排障记录：`SetCursorPos`/`Cursor.Position` 移动光标**不**重置 GetLastInputInfo，不能用鼠标挪 1px 方案；用注入单独 Ctrl 按键代替。

## 顺带 · Win11 DWM 自动圆角 —— PASS

主窗 decorations: true（默认边框）。桌面截图角像素采样（scripts/corner-check.mjs）：左上角对角线序列 `背背窗窗窗窗窗`——角点 2px 透出背景、3px 起为窗口色，与 Win11 DWM 8px 圆角半径的对角线切割一致（0.29r≈2.3px）。肉眼复核见 wv2-popup-desktop.png。

## 环境适配记录（非设计偏离）

- vite/tauri devUrl 端口用 **14200**：默认 1420 落在本机 Hyper-V TCP 排除段 1368–1467 内（EACCES）
- 启动 `pnpm tauri dev` 需前置 PATH（cargo + node_global + node）：本机用户 PATH 中 `C:\Program Files\Tailscale"` 条目含残留引号，其后的条目对 cmd 派生进程不可见
- Playwright 1.63.0 + pngjs 7.0.0 为 devDependencies；chromium 浏览器经代理安装

## 证据文件清单

| 文件 | 内容 |
|---|---|
| dev-home.png / dev-rest.png | Chromium 对 vite dev server 的 #/ 与 #/rest 截图（1280×800） |
| wv2-rest.png / wv2-rest-noglass.png | 真实 WebView2 内休息页：玻璃开 / 玻璃关对照 |
| wv2-focus.png | 焦点断言结果页（PASS 表格） |
| wv2-popup-desktop.png | 桌面级截图：主窗 + 实心暖卡弹窗同框（可见圆角） |
| wv2-hotkey.png | 热键事件列表页（注入尝试后，如实为空） |
| wv2-verdicts.json / focus-test-result.json | 脚本判定的结构化结果 |
| focus-test.log | 原语A 断言日志（Rust 落盘） |
| poc-runtime.log | 运行日志：启动/热键注册/空闲 begin·end/焦点测试 |
| hotkey-probe3·4·5.log | 热键注入隔离探针（证明环境限制与 gika 无关） |

复现：`pnpm vite dev` + `node scripts/shot.mjs`；`pnpm tauri dev`（带 CDP 与 GIKA_IDLE_SECS=5 环境变量）+ `node scripts/webview2-evidence.mjs`。
