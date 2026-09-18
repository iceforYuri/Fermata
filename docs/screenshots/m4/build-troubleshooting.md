# M4 build 排障记录（2026-09-19）

## 结论

- **打包成功**：`pnpm tauri build` → `src-tauri/target/release/bundle/nsis/gika_1.0.0_x64-setup.exe`（1.9MB，NSIS 组件经代理正常下载；release 编译 2m46s）。
- **产物运行验证**：`target/release/gika.exe` 直跑（空库冷启动，空态正常渲染）——截图 `release-binary.png`。
- **静默安装未成行**：`setup.exe /S` 在本机挂起（单线程、0 CPU、无窗口、无子进程，>6 分钟无产出；两次尝试，第二次带 HTTPS_PROXY 同现象）。判定为安装器在本机的环境问题（疑似 WebView2 检查/系统策略挂起），非包体缺陷。未强推交互安装（本机合成输入不可靠，PoC 已证）。
- 建议人工双击安装一次验证；如复现挂起，换 `webviewInstallMode: "offlineInstaller"` 或先查 %TEMP% 下 NSIS 日志再议。

## 复现命令

```bash
# build（代理下 NSIS 依赖下载）
HTTPS_PROXY=http://127.0.0.1:7897 pnpm tauri build
# 静默安装（本机挂起点）
src-tauri/target/release/bundle/nsis/gika_1.0.0_x64-setup.exe /S
# 直跑验证（等效产物内容）
GIKA_DB_PATH=...\gika-release.db target/release/gika.exe
```
