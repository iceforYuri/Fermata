# Fermata v1.0.0 发布验收总表（2026-09-20）

## 回归证据

| 项 | 结果 |
| --- | --- |
| cargo test（数据内核） | 7/7 PASS |
| verify-m1（进程页交互，mock） | 38/38 PASS |
| verify-m2（系统层六项，真实 exe CDP） | PASS（见 m2/checklist） |
| verify-m3（统计页钻取，mock） | 19/19 PASS |
| verify-m4（设置页双态，mock） | 11/11 PASS |
| tsc --noEmit | 干净 |
| pnpm tauri build | 成功（fermata.exe 7.2MB + NSIS 4.6MB） |

## 更名与迁移

- gika → Fermata 全量改名（crate/bin/productName/identifier/事件名/拖拽 MIME/env FERMATA_*），详见 deviation D45
- 数据迁移实证：旧 `com.gika.dev/gika.db`（md5 `7b0f239a…`）→ 新 `com.fermata.app/fermata.db`（md5 相同），旧目录原样未动；启动日志 `[rename] 旧库已复制到新目录`；二次启动幂等不重复迁移
- 真实 exe 冒烟：启动 → 版面（旧数据在位）→ 统计 → 设置，窗口标题 Fermata

## 版权清理

- 移除第三方 Gika 应用参考截图（docs/gika.png、docs/gika-day.png）与 21st.dev 组件文档（docs/reference/navigation.md，目录已空删）
- 引用点全部改写为纯文字说明，无死链；docs/ 与 README 无其他第三方内容残留（MiSans 字体许可文件随包）

## 截图清单（本目录，全部 Fermata 现行形态）

mock 双主题（light 无后缀 / dark 带 -dark）：
board-rich、board-detail、board-library、board-archive、board-undo-toast、drag-ghost、board-empty、rest-page、stats-month、stats-day、stats-day-tip、stats-year、settings、overlay-switcher、overlay-restpop

真实 exe CDP 实拍（真实库）：
real-board、real-stats-month、real-settings、real-overlay-switcher、real-overlay-restpop
（休止符右下角落点证据：../v12/restpop-bottom-right-position.txt；本机 CopyFromScreen 抓不到 WebView2 窗，实拍走 CDP Page.captureScreenshot，见 D43/D45）

## 宪法七条自查

调度为内核 ✓（状态机测试绿）· 时间默认不计 ✓（休止符无超时、恢复显式）· 颜色只属于色标 ✓ · 玻璃边界 ✓（浮层实心暖卡）· 无表单 ✓ · 推拉不弹窗 ✓ · 六原语薄接口 ✓（前端无 Tauri import）
