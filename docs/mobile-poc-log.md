# 移动端 PoC · 环境与踩坑笔记（2026-10-21）

> 对应 07 文档第 7 节 PoC 验收门。本文记录阶段 0 工具链与门 1 的证据；后续门的进展追加于此。

## 验收门状态

| 门 | 状态 | 证据 |
|---|---|---|
| 1. 构建安装运行 | ✅ 模拟器通过（真机待用户插线） | docs/screenshots/mobile-poc-boot.png（进程页空态完整渲染：报头/已完栏/稿库 rail/空态文案） |
| 2. 息屏计时 + 到点提醒（架构改：时间戳记账 + AlarmManager，无常驻服务） | ✅ 模拟器通过（真机待用户） | logcat：闹钟 120000ms 触发误差 56ms；接收器跑在系统新拉起的进程；息屏期间计时连续 |
| 3. 通知暂停/继续按钮 | ✅ 模拟器通过（真实点击 + adb 双路径） | 截图 mobile-poc-notif-paused.png（已暂停·累计450s·按钮翻转为继续）；logcat onReceive→pause→resume |
| 4. WebDAV 推/拉闭环 | ⏳ 未开始（先用本机临时 WebDAV 服务验机制） | — |

## 工具链落点（全部本机、用户态、无需管理员）

- JDK 17（Temurin）：C:/Users/ice/AppData/Local/Android/jdk17（winget 装机会弹 UAC，改为 zip 解压版）
- cmdline-tools 16111833 + sdkmanager：%LOCALAPPDATA%/Android/Sdk/cmdline-tools/latest
- NDK 28.2.13676358 + cmake 3.22.1 + platforms android-36/36.1：同 SDK 目录
- Rust Android targets ×4：aarch64 / armv7 / i686 / x86_64-linux-android
- 用户级环境变量：ANDROID_HOME、NDK_HOME（注册表 User 作用域）
- 模拟器：Medium_Phone（Android 37 x86_64 镜像，机器上原有）

## 门 2/3 发现（2026-10-21）

- **架构修正（待用户确认后改 07 文档第 7 节）**：原定「自写 Kotlin 前台服务插件」→ PoC 证明更优解是**时间戳记账 + Chronometer 通知 + AlarmManager**：计时与进程死活解耦（系统会拉起新进程投递事件，elapsed 用时间戳算零误差），避开 Android 15+ dataSync 前台服务每天 6 小时上限。前台服务仅在后续需要运行锁常驻标记时再评估。
- **Android 14+ 精确闹钟（SCHEDULE_EXACT_ALARM）默认不授予**：直接 setExactAndAllowWhileIdle 会 SecurityException 崩 onCreate。已修为 canScheduleExactAlarms() 检查 + 不精确回退；M2m 需要设置页引导用户授权（系统设置入口）。
- **隐式 Intent 投递不到无 intent-filter 的静态接收器**：通知按钮必须用显式组件 Intent（Intent(ctx, KeeperReceiver::class.java)）。接收器现为 exported=true（PoC 妥协：adb 直发测试路径需要；M2m 接线完成后应回 false，PendingIntent 以应用身份投递不受影响）。
- Keeper.kt / KeeperReceiver.kt 位于 gen/android/app（生成工程内手写件）；MainActivity 的 PoC 接线（启动即开会话）将在 M2m 改为「有运行进程才发会话通知」。

## 踩坑记录（重要）

1. PATH 坏条目：机器 PATH 里有一条 C:/Program Files/Tailscale"（尾部多一个英文引号），cmd 与 CreateProcess 的路径检索到它就断，导致子进程找不到 pnpm/cargo。我已在会话内绕过；建议用户删除该坏条目（正确的 Tailscale/ 条目在）。
2. pnpm tauri（napi 形态）在脚本会话里 spawn cargo 失败（program not found，与上一条同根）。解法：移动构建一律走原生 CLI：cargo tauri android ...（已 cargo install tauri-cli 2.11.4）。
3. Windows 未开开发者模式 → symlink 特权缺失：cargo tauri android build 把 libfermata_lib.so 链入 jniLibs 时报 SymlinkNotAllowed。无管理员权限改注册表，故打了本机补丁：cargo-mobile2-0.22.4/src/os/windows/ln.rs 在 ERROR_PRIVILEGE_NOT_HELD 时回退 fs::copy（见该文件内「Fermata PoC 本机补丁」注释），并以 cargo install --offline --force 重装了 cargo-tauri。影响面：仅本机 cargo 缓存；还原 = 删掉该源码目录后重装。用户若开启「开发者模式」，此补丁可留可弃。
4. 新版 sdkmanager：--licenses 与 --proxy 选项已废弃（走系统代理）；包路径用斜杠（ndk/28.2.13676358）。
5. capabilities 拆分：global-shortcut:default 移到 desktop.json（platforms 桌面三平台），default.json 保持双端通用。
6. 图标：icons/icon.png 是从 icon.ico 抽的 64×64 占位图——正式图标待质感层设计。

## 构建命令（脚本会话内可用）

    $env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notmatch [char]34 }) -join ';'
    $env:JAVA_HOME="C:/Users/ice/AppData/Local/Android/jdk17"
    $env:ANDROID_HOME="C:/Users/ice/AppData/Local/Android/Sdk"
    $env:NDK_HOME="C:/Users/ice/AppData/Local/Android/Sdk/ndk/28.2.13676358"
    $env:HTTPS_PROXY="http://127.0.0.1:7897"; $env:HTTP_PROXY="http://127.0.0.1:7897"
    cargo tauri android build --debug --target x86_64 --apk
    # 模拟器：emulator.exe -avd Medium_Phone -no-window -no-audio
    # 安装：adb install -r gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
