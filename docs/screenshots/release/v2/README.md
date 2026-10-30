# Fermata 2.0 界面预览

此目录用于 README 和使用手册的 2.0 产品图片。旧版截图保留在上级目录，供历史设计与验收文档引用。

- 来源：当前 React 组件，通过 Vite 和 Playwright Chromium 渲染；数据来自 `src/api/mock.ts`，不读取用户数据库。
- 预览环境的 Tauri 事件订阅和 Keeper 原生桥使用空操作替身；不修改组件样式或模拟原生通知结果。
- Windows：1200 × 800 CSS 像素，缩放倍率 1。
- Android 布局：412 × 915 CSS 像素，缩放倍率 2，通过 Android UA 选择 `MobileShell`。画面不添加模拟状态栏或手机外框。
- 演示时刻：2026-10-30 17:20（Asia/Shanghai），固定日期和读数；截图操作、动画使用正常浏览器时序。
- 范围：两端的进程页、详情、稿库、月统计、日统计、同步设置、暗色进程页，共 14 张。

这些图片验证的是当前组件的呈现，不是 APK 或 Windows 可执行文件的实机截图。通知权限、息屏计时、系统回收与 WebDAV 实际通信另行验收。首次安装不会带入演示数据。

## 复现

在仓库根目录分别运行：

```powershell
pnpm dev
node scripts/shot-v2-release.mjs
```

需已安装 Playwright Chromium。脚本在独立浏览器上下文操作界面，不连接正在运行的 Fermata，也不修改真实数据。生成记录见 [capture.json](capture.json)；脚本为 [shot-v2-release.mjs](../../../../scripts/shot-v2-release.mjs)。
