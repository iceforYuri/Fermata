# 桌面技术栈：Tauri 2 + React + TypeScript（Electron 兜底）

初判 Electron——理由是 Tauri 在 Windows 的透明窗口 bug 群（#15512 模糊失效 / #15490 白闪 / #15947 黑块）会杀死"液态玻璃浮层"卖点。经与用户侧调研稿交叉校勘，认定该论据对本产品**不成立**：Round 11 已定「玻璃语言边界」——液态玻璃只做页内效果（休息页/完成档案盖自家内容），对外浮层为实心暖卡，全程 opaque 窗口，绕开全部 transparent 路径 bug。Tauri 官方插件（global-shortcut / tray / notification / sql / single-instance）+ `focusable:false`（WS_EX_NOACTIVATE）+ `user-idle`（~50 行 Rust）覆盖全部原生活需求；3–10MB 包体与"轻量常驻工具"气质一致。前端 React + TS（AI 语料最大，两稿一致）。

**附 PoC 门槛（M0 前，1–2 天）**：验证 ① `focusable:false` 弹窗不抢焦点且鼠标可点；② opaque 窗口内页内 backdrop-filter 满血；③ global-shortcut + 空闲回调。任一失败即触发兜底切 Electron，前端零改动。

## Considered Options

- **Electron（兜底）**：系统集成最省心（powerMonitor / showInactive 全是一行 API）、固定版本 Chromium 渲染可预期；代价是 ~90MB 包体与每窗一个 renderer。切换触发 = PoC 失败，或 Rust 层成为持续障碍。
- **WPF / WinUI 3 / Avalonia / Qt / Flutter / Wails**：排除理由见 docs/05-技术调研.md（合并校勘版）。
- 内存与启动不构成决策依据：Windows 上两栈同量级（Elanis 2026-09 实测，两稿相关声称均被修正）。

## Consequences

- **Rust 面收敛**：全部原生活走六原语薄接口（唤出 / 隐藏 / 置顶 / 焦点 / 空闲 / 热键），前端不触 Tauri API——保证 ↔ Electron 双向迁移都收敛在这一层。
- **浮窗全程 opaque**：不碰 `transparent: true`；Win11 DWM 自动圆角，Win10 方角可接受。
- 视觉规则全部 design tokens 化（CSS 变量），与 docs/01-进程页.md 视觉规格一一对应。
- WebView2 版本随用户机器漂移 → CSS 只用 baseline 特性，视觉验收以主流 WebView2 为准。
