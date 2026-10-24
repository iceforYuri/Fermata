# 移动端 PoC · 环境与踩坑笔记（2026-10-21）

> 对应 07 文档第 7 节 PoC 验收门。本文记录阶段 0 工具链与门 1 的证据；后续门的进展追加于此。

## 验收门状态

| 门 | 状态 | 证据 |
|---|---|---|
| 1. 构建安装运行 | ✅ 模拟器通过（真机待用户插线） | docs/screenshots/mobile-poc-boot.png（进程页空态完整渲染：报头/已完栏/稿库 rail/空态文案） |
| 2. 息屏计时 + 到点提醒（架构改：时间戳记账 + AlarmManager，无常驻服务） | ✅ 模拟器通过（真机待用户） | logcat：闹钟 120000ms 触发误差 56ms；接收器跑在系统新拉起的进程；息屏期间计时连续 |
| 3. 通知暂停/继续按钮 | ✅ 模拟器通过（真实点击 + adb 双路径） | 截图 mobile-poc-notif-paused.png（已暂停·累计450s·按钮翻转为继续）；logcat onReceive→pause→resume |
| 4. WebDAV 推/拉闭环 | ✅ 模拟器通过（真机+坚果云凭据待用户） | logcat：[webdav-poc] OK put 291ms / get 44ms / matched / delete_ok；本机 wsgidav 匿名读写服务 + 模拟器 10.0.2.2 回环 |

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

- **reqwest 0.13 改名**：TLS 特性 rustls-tls → rustls（rustls-platform-verifier 走系统证书仓，Android 可用）。
- **wsgidav 起服务**：用 Scripts 目录的 wsgidav.exe（python -m wsgidav 无 __main__）；匿名读写模式够 PoC 用。
- PoC 门 4 的临时入口：MobileShell 右上 ↻ 钮（标记「M4m 同步落地后移除」）；webdav_probe 命令同理。

## M2m：Keeper 接真实计时（2026-10-21）

- 插件形态：本地 Tauri 插件 src-tauri/plugins/keeper（Rust init + Kotlin KeeperPlugin/Keeper/KeeperReceiver）。会话通知由 JS 端真实状态驱动（keeper.update：进程名 + 运行/暂停 + chronometer 起点 + 暂停累计）；按钮 → KeeperReceiver 即时翻转 → keeper-action 事件回 JS → act(process_pause/resume) → 通知落定。
- 命名纪律（踩坑）：插件的 CARGO_PKG_NAME / links / Builder::new 必须同名（keeper），否则权限生成器用包名、IPC 用插件名，两端对不上——报「not allowed. Plugin not found」。register_listener 是基类命令，但权限不自动生成，要列进 build.rs 的 COMMANDS。
- pause/resume 命令加了可选 at_ms 参数：后台点按钮时按时间戳计，防漂移（接线待 M2m 收尾）。
- MainActivity 的 PoC 自启接线已拆；通知权限授权引导（POST_NOTIFICATIONS 运行时弹窗）待 M2m 收尾一并做。
- 休止符到点提醒的闹钟接线（scheduleReminder 由 scheduler 在片头/暂停时调用）待 M2m 收尾。

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


## 2026-10-22 M0m 同步就绪 schema（桌面侧，docs/07 §5）

- MIGRATION_V6：进程/计划/步骤/分段四表加 uuid（全局唯一，lower(hex(randomblob(16)))）+ updated_at；steps 加 deleted_at 软删除墓碑；四个唯一索引；四个 AFTER UPDATE 触发器（julianday 毫秒落戳，显式赋值优先，WHEN NEW=OLD 防递归）。
- 回填：uuid 全量生成；updated_at 回填 created_at/started_at（步骤 COALESCE(done_at,0)——旧行保守视为最老，LWW 让位任何真实编辑）；settings 写入 device_id。
- ops.rs：四处 INSERT 带 uuid/updated_at；entry_delete 改软删；queries.rs 两处步骤读取过滤 deleted_at IS NULL。
- 验证：cargo test 20/20 过；模拟器旧库（v5，含进行中进程 beta）直升 v6 无损——version=6、四表 uuid/updated_at 无 NULL、四个触发器就位、device_id 落库、运行中进程计时连续。
- 事件日志完备性审计（30+ 种 kind 逐个核对 payload）仍欠，M4m 同步模块落地前做。

## 2026-10-22 稿库抽屉手势补齐（M1m 漏项）

- 左缘右滑开抽屉（进程页为条带最左端，右滑无处可去，docs/07 §6）：touchstart 落在左缘 28css px 内即进入抽屉手势流，1:1 跟手 + scrim 联动渐显，松手 >64px 开、否则弹回。
- 抽屉内向左拖回关闭：同一套手势语言，1:1 跟手，松手过 64px 关、否则归位；竖向滚动不受影响（方向锁先判横竖）。
- 验证：CDP（webview_devtools_remote）合成触摸事件逐项确认监听器挂载与开合状态；跟手中途截图存 docs/screenshots/mobile-drawer-edge-drag.png。
- 注意：屏幕最外侧 ~20dp 是系统返回手势区（手势导航固有行为，所有抽屉 app 一样），边缘手势从稍内侧起滑即可；左上角字形按钮是稳定入口。

## 踩坑记录（续）

7. 模拟器 WebView SIGILL：本机模拟器（Android 37 x86_64，WebView 145.0.7632.218）上，应用退后台触发 onTrimMemory 时 WebView 原生代码 SIGILL（固定地址，ILL_ILLOPN），进程死亡并触发「crashed too many times」限流。与我们的 Rust/JS 无关（JS/SQLite 不可能在 libwebviewchromium.so 里造成非法指令）；前台使用不受影响。真机后台保活验证时要区分这个模拟器固有崩溃。调试技巧：debug 包可用 adb forward tcp:9333 localabstract:webview_devtools_remote_<pid> 接 CDP，用 Input.dispatchTouchEvent 合成可靠触摸流。


## 2026-10-22 M4m 同步模块落地（docs/07 §5 v1）

- 引擎 src-tauri/src/sync/mod.rs：整库快照 gzip 单文件（/fermata/snapshot.json.gz + snapshot.meta.json rev 读前检测）、v1 整库 LWW（远端先动且本机脏 → 远端赢，本机覆盖前自动备份 exports/backup-*.fermata.json）、首接冲突双方向按钮（推送前远端强制备份进 /fermata/backups/）、运行锁（locks/<device>.json，TTL 10 分钟，生命周期刷新 + 前端 5 分钟心跳）。
- 设置同步纪律：快照仅计时参数（slice/连续阈值/软硬模式/空闲阈值）随包走；sync_*、device_id、外观等留本机（apply_remote 保留逻辑，有单测）。
- 凭据：桌面 keyring（Windows 凭据管理器）；Android 暂为应用私有目录 sync.secret 明文文件——deviation，M5m 换 Keystore 后上真机。
- 触发：生命周期命令（开始/暂停/继续/完成/切换/休止符进出）立即推；其余变更经 changed() 防抖 30 秒；启动与回前台拉（Rust 侧 5 分钟节流）；不轮询。
- 验证：verify_sync（双模拟设备对 wsgidav 全流程：首推/首拉/快进/noop/冲突远端赢+本机备份/锁读写/首接冲突选推送接 rev）全过；模拟器真机链路：注入配置 → 启动拉取报 first_conflict → 设置页点「拉取远端」→ rev4 落库 + 本机备份落 /data/user/0/.../exports/。
- 设置页同步区（双端同组件）：连接三行下划线输入 / 状态行（服务·账号·设备·最近同步·基线 rev）/ 立即同步 / 断开连接 / first_conflict 方向按钮；移动端按钮行 flex-wrap 修复。


## 2026-10-22 运行锁 UI + 接管 + Keystore + 探针拆除

- 挂起行锁徽标：「在 X 设备运行中 · 始于 HH:MM」（TTL 过期转「可能仍在」）；locks store 60 秒轮询 + sync-done 刷新。接管入口：桌面点击带锁进程直接接管；移动端点按仍开详情卡（查看），卡内 ⤒ 才是接管——实测修正过一次拦截顺序。
- ops::takeover：对端开口段以锁 written_at 收界（钳到不早于段起点）、记 takeover/switch 事件、本端开口续计；kernel 测试 takeover_bounds_remote_segment_at_lock_time 过。模拟器全链路：外来锁 → 徽标 → ⤒ → phone-task 收界挂起、second-task 开跑、rev 推到 9。
- D64 闭环：Android 凭据换 Keystore（SecretBox AES/GCM + keeper PluginHandle 直调），旧明文文件自动迁移删除。
- PoC 探针拆除：MobileShell ↻/☾ 临时钮、webdav_probe 命令、.m-poc-webdav 样式全删。
- 事件日志完备性初审计：ops.rs 38 个写操作全部记事件（42 种 kind）；逐 kind payload 完备性留待 v1.5 实体合并前细审。


## 2026-10-22 M5m 手势收尾：触摸拖拽排序 + 稿库拖出直排

- 挂起队列触摸拖拽（docs/07 §6：长按不松手拖动 = 菜单合并进拖拽）：移动端换 touch 事件流（pointer move 被滚动抢占的老坑）。
- **重要踩坑：触摸序列锚定起始 DOM 节点**。拖拽中的「克隆替换被拖行」会把触摸目标从文档树移除，之后的 touchmove/touchend 永远到不了 window——表现是手势卡死、drag 状态残留。修法：被拖行原位 transform 跟手（不克隆），与「move/up 挂 window」双保险。这套教训适用于以后一切触摸拖拽。
- 稿库条目长按右拖出抽屉右缘 = 关抽屉 + 排入挂起队列（LibraryPanel 容器级 touch 手势流；移动端禁用 HTML5 draggable 防原生长按抢手势）。
- 验证（CDP 合成触摸）：长按出菜单 ✓ 菜单合并进拖拽 ✓ 拖拽换序落库 ✓ 松手无残留 ✓ 拖出抽屉排入 ✓；锁徽标 TTL 过期自动转「可能仍在运行」✓。


## 2026-10-22 构建链两个坑（耗费约一小时的教训）

8. **Tauri 前端嵌包缓存**：generate_context! 在编译宏期读 dist 嵌进 libfermata_lib.so。只改前端（CSS/TSX）时 cargo 判 crate 未变 → 重链旧 .so → APK 里是旧前端。规矩：前端改动后构建前 touch 一下 src-tauri/src/lib.rs（或确认有 Rust 改动），装完用「设置页底部构建戳」核对。
9. **Gradle 守护进程锁**：强杀 java/中断构建会留下 daemon registry 锁，后续构建的守护进程空转等锁（日志全是 "Waiting to acquire shared lock on daemon addresses registry"）。修法：杀光 java → 删 ~/.gradle/daemon/*/registry.bin* 与 *.lock → 重建。别强杀构建中的 java。


## 2026-10-23 全页面视觉走查与交互验收（模拟器 + Android UA 浏览器）

**实测页面/交互**：进程页（活跃+挂起）、详情底卡、切换断点确认、长按菜单、完成撤销 toast、稿库抽屉与条目菜单、统计年/月/日、日网格点按清单、设置编辑与暗色、休息页/继续、完成档案。

**发现并修复**：
1. 浮层压底栏：抽屉/详情/长按菜单打开时底栏仍可点且压在最上层 → 浮层打开时底栏收起。
2. 完成档案移动端关不掉：panel 与 backdrop 同尺寸，点外侧无目标，系统返回键直接退 App → 档案头加 × 关闭（36px 圆）。
3. 月视角大环沿用桌面横排（环近 450px、图例挤右上）→ 移动端纵向堆叠：环 168px 居中、三列指标在下、图例通栏。
4. 日网格列宽与刻度脱钩（9×43=387 < 411，右侧空 24px）→ 列宽 100%/9 铺满，body 左右 16px 内缩，刻度与网格同边线；同时修正首末刻度贴边。
5. 切换确认做成卡片内联一条且标题/⤒ 仍在 → 改为卡片原位专注确认视图（旧进程名 + 断点输入 + ×/✓），sheet 高度 morph 到 40%。
6. 统计页底部内容被底栏压住 → stats-scroll / daygrid-scroll 增加 88px 底部留白。
7. 设置「账号」为空时渲染空行 → 空值不渲染；手机端 Esc 取消提示改「×」。
8. 撤销 toast 文案折行 → nowrap + 宽度上限省略。
9. 移动端复制「回车落挂起队列」（桌面键位）→「新进程，写完即入挂起队列」。
10. 日视角大日期标在网格下方易歧义 → 移动端移到日块顶部右侧（Gika 节奏）。

**仍建议（未改）**：年视角在只有个别月份有记录时下半屏留白较多（数据密度问题，后续可考虑 3×4 或纵向居中）；日块在数据稀疏时仍偏长（可再压缩）；桌面 clamp 类布局规则今后新组件需先做移动端宽度回归。


## 2026-10-23 统计年月日横滑重做（用户实报“左右切换不合适”）

**复现**：统计页横滑时外层页面条带同步移动（设置页/进程页被拉出来），松手后内层才切年/月/日；且内层切换动画用的是纵向 translateY。两个手势叠在一起，观感与方向都不对。

**重做为横向轮播**：
- 统计页内可消费的方向（月⇄年/日）：外层条带完全不动；统计内容 1:1 跟手（0.6 阻尼），相邻视角作为预览层从左右实时滑入。
- 松手过 48px：继续滑满一屏提交轮播，结束无动画归位；顶部指示在松手时即切到目标视角。
- 短滑 <48px：回弹到当前视角，不切页。
- 到边界才交还外层：年在最左右滑→进程；日在最右左滑→设置。边界时统计内容不移动。
- 内层驻留动画从 translateY 改为 translateX（年⇄月⇄日与日历点进日视角统一）。

**验证（Android UA 浏览器，CDP 合成触摸）**：中途跟手时 outer track 位移恒为 0、drill-stage 位移 -72px、预览层 left=339；提交帧 90ms 时指示已到“日”、预览层仍在过渡；400ms 后预览清除、指示“日”。日→设置/年→进程边界中间态 track 位移 ±120px、内层 0，松手分别到 tab 2/0。短滑 30px 回弹保持“月”。

## 2026-10-24 统计横滑最终定稿：保留 R2 轮播 + 边界交接（回退 R3）

**用户实机确认**：R2（926af0b）的“相邻视角预显 + 拖拽到边界才翻页”才是想要的效果；之前看到的异常来自模拟器仍挂着旧包。故回退 77fb4e1（循环 + 横向淡入淡出）。

**保留的真实修复**：drillTo 原先读取闭包里的初始 view，导致日→月（胶囊或其他路径）可能被误判为“已是当前视角”而 return。改为从 viewRef.current 读当前视角，轮播/边界/胶囊点击的状态不再卡住。

**R2 规则（最终）**：
- 统计内左右滑：年⇄月⇄日 的内嵌轮播，相邻视角实时预显；
- 到边界才交还外层：年右滑→进程，日左滑→设置；
- 进入统计默认月；短滑回弹；
- 拖动过阈值继续滑满一屏提交，指示器松手即切换。

**验证**：月→日→月→年→月；胶囊日→月；日左滑边界→设置（track -120px、内层不动）；设置右滑→统计（月）→年右滑→进程（track +120px）；全部通过。