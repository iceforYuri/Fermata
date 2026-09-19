# M4 验收 · 设置 + 收官（2026-09-19）

## 设置项清单与生效链路

| 设置 | 键 / 默认 | 生效链路 |
|---|---|---|
| 时间片长度 | slice_minutes=45 | 调度器每次 tick 读 settings → 影响下一个环（当前环不动，03 明文） |
| 连续工作阈值 | continuous_limit_minutes=90 | 调度器连轴评估 |
| 休止符模式 | rest_mode=soft | 调度器软/硬分支 |
| 提醒样式 | 只读说明行（应用内弹窗，Windows 通知兜底） | — |
| 空闲检测阈值 | idle_threshold_minutes=5 | Rust 看门狗每秒重读 settings，改即生效 |
| 空闲回归确认 | idle_confirm=1 | 主窗确认卡开关 |
| 主题 | theme=light | board store 每次刷新应用到 document data-theme；浮层窗经 store-changed 同步 |
| 字号阶梯 | font_scale=standard | data-font → tokens 字号变量三档 |
| 版面密度 | density=standard | data-density → 行距变量 |
| 窗口置顶 | always_on_top=0 | sys::pin → set_always_on_top + 落库，启动时读回 |
| 左栏稿库宽度 | lib_width=300 | --panel-w-left（240–360 夹紧） |
| 色板展示 | 7 色只读色票（命名后置 v1.x） | palette 表 |
| 切换浮层热键 | hotkey=Alt+Q | 捕获态录入 → setting_set + hotkey_apply 重注册；失败回滚 |
| 事件日志导出 | 按钮 | export_events → app_data_dir/exports/events-*.json |

## 全量回归

- cargo test：4/4（M0 三件套 + M3 网格归属）
- verify-m1（进程页 mock）：15/15
- verify-m2（系统层真实 CDP）：16/16；verify-m2-idle：PASS
- verify-m3（统计页 mock）：14/14
- verify-m4（设置 mock）：10/10；verify-m4-real（真实 CDP）：6/6（主题跨窗/置顶/热键重注册/导出/环口径）
- 空库冷启动全流程：final-*.png 十幕（空态→新建→断点卡→运行→切换→撤销→入档→档案→统计→设置），版面终态 1 挂起 1 完成 ✓

## 03 文档对照 + 宪法终查

| 规格 | 状态 |
|---|---|
| 单列滚动 + 吸顶 chips 目录 + scroll-spy | ✓ verify-m4 ✓4 |
| 控件双态（排版文字 → 原地变形，1px 下划线，Enter/失焦提交，Esc 还原，无保存按钮） | ✓ verify-m4 ✓1–3 |
| 分组五项与文档一致；隐私/AI/付印PDF 属后置未做（不越界） | ✓ |
| 主题两套即切即生效全窗含浮层 | ✓ verify-m4-real ✓1 |
| 热键捕获 + 重注册 + 失败回滚 | ✓ verify-m4 ✓9–10 + real ✓3–4 |
| 导出事件日志 JSON | ✓ real ✓5（文件存在且可解析） |

宪法七条终查：
1. 调度为内核 ✓（设置只是 settings 表的视图）
2. 时间默认值不计 ✓（休息/空闲/暂停全显式恢复）
3. 颜色只属于色标 ✓（chips/胶囊选中态用墨色染底+内嵌脊线）
4. 玻璃边界 ✓（浮层实心；玻璃仅休息页/档案）
5. 全 app 无表单 ✓（设置页零 form 元素，全双态）
6. 推拉不弹窗 ✓
7. 六原语薄接口 ✓（export/pin/hotkey 全走 api 层）

## 五阶段验收总表

| 阶段 | 验收 | 证据 |
|---|---|---|
| PoC | 三原语（弹窗不抢焦点 / 页内玻璃 / 热键注册+空闲） | docs/screenshots/poc/ |
| M0 | 四问查询 + 3 测试 + 一周种子 | docs/screenshots/m0/acceptance.md |
| M1 | 15/15 + 真实 WebView2 接线 + 视觉定稿 | docs/screenshots/m1/checklist.md |
| M2 | 16/16 + 空闲 PASS + 双渲染 + 三恢复路径 | docs/screenshots/m2/checklist.md |
| M3 | 14/14 + 口径抽查 + seed:deep 实拍 | docs/screenshots/m3/checklist.md |
| M4 | 10/10 + 6/6 + 冷启动十幕 + build（见下节） | 本文件 |

## 构建

- `pnpm tauri build` 成功：`src-tauri/target/release/bundle/nsis/gika_1.0.0_x64-setup.exe`（**1.9MB**，NSIS）
- release 产物直跑验证：`release-binary.png`（空库冷启动空态正常）
- 静默安装本机挂起（环境问题，非包体缺陷）：完整记录见 `build-troubleshooting.md`

## 证据质量注记（2026-09-19 复验收尾）

- 全部 mock 截图以 `--disable-lcd-text` 重截（消 ClearType 彩边）；边缘彩边率实测 47.4% → 2.7%（scripts/fringe-check.mjs）
- `board-dark-v2` 与 `board-dark` 字节同源（mock 下两图同链路）："设置切主题 → 版面换肤"的真实环境证据由 verify-m4-real.mjs 跨窗断言承担（主窗+浮层 data-theme 同步翻转），不靠这张图
- 休止符弹窗暗色展开态见 `restpop-next-dark.png`（色脊入镜）
> v1.1 修订后证据：docs/screenshots/v11/（胶囊导航/rail/步骤栈空圈/日滚动/淡暖底/MiSans 与 A/B 三值）；回归：verify-m1 18/18、verify-m3 v1.1 12/12、verify-m4 11/11。

> v1.2 修订后证据：docs/screenshots/v12/（morph 导航/统一栈断点条/拖拽虚影帧/日网格半圆+时间段刻度/设置左竖导航/休息页 Esc 提示/rail 常驻提示）；回归：verify-m1 20/20、verify-m3 12/12、verify-m4 11/11、cargo test 6/6。
