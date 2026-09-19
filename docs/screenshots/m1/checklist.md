# M1 验收 · 进程页 + 视觉定稿（2026-09-19）

## 原型定稿参数表（详见 docs/deviation.md D10）

| 参数 | 定稿值 |
|---|---|
| 色标 7 色（亮） | #D0493B 朱 / #D97E33 橙 / #BE9229 珀 / #5F8A3C 苔 / #3D7D67 青 / #486E8D 黛 / #97516B 茜 |
| 色标 7 色（暗） | #E47A6F / #E59A5A / #D3AE57 / #8AAC63 / #66A78F / #7595B2 / #BB82A0 |
| 染底 / 边框 / 圆角 / 条脊 | 13% / 1px·55% / 6px / 32px 全饱和 |
| 行高阶梯 | 报头28 / 已完栏40 / 活跃112 / 挂起64 / +号40 / 间距10 |
| 老化渐褪 | opacity = max(0.45, 1 − 0.55·ln(1+m/8)/ln(61))，m=挂起分钟 |
| 时间环 | 64px / 环粗 3px / 呼吸 2.6s ease-in-out（opacity .72↔1, scale 1↔1.035，仅最后 5 分钟） |

## docs/01 视觉规格逐条对照

| 规格 | 实现位置 | 证据 |
|---|---|---|
| 三 tab 固定空间位置 + 自绘标题栏（decorations:false + 拖拽区 + 最小化/最大化/关闭） | components/TitleBar.tsx；tauri.conf.json | wv2-board.png |
| 报头「9 月 19 日 · 周六」+ 今日累计实时 | components/BoardHeader.tsx | board-rich.png |
| 已完栏弱化横条（亮偏灰/暗偏褐）"N 件 · 总时长"，点击弹档案 | BoardHeader.tsx DoneBar | board-rich.png / archive-open.png |
| 活跃行 112：确认条脊点击完成 / 28px 半粗标题 / 当前步骤槽 ▸+勾选推进动画 / 环 64 / 累计 12.5 / 暂停继续 | components/ActiveRow.tsx | board-rich.png / verify ✓1 |
| 挂起行 64：15px 标题 / 断点 ▸ / 挂 23m / 对数渐褪 / hover 复活手型 / 点击切换 / 4px 阈值拖排序 / 等AI 不褪色+小方标 | components/SuspendedRow.tsx | board-rich.png（四行不同透明度）/ verify ✓8 |
| 底部 + 号回车即建落队尾 | components/NewProcessRow.tsx | verify ✓7 |
| 空态引导语 + 双入口 | components/EmptyState.tsx | board-empty.png / verify ✓14 |
| 折线 1px 上紧下呼吸 | .foldline（margin 6/18） | board-rich.png |
| 3s 撤销 toast，不撤销折入档案 | store/actions.ts + UndoToast.tsx | undo-toast.png / verify ✓2 ✓3 |
| 完成档案浮层：页内玻璃、版式同中列、保留色脊、重新打开回队尾、点模糊区收起 | components/ArchiveOverlay.tsx | archive-open.png / verify ✓4 |
| 左栏稿库 300px 划入、两组、44px 条目、hover ✕/✓、拖入成进程（折线区=激活） | components/LibraryPanel.tsx + BoardPage.tsx 落点 | board-library-open.png / verify ✓9 |
| 右栏详情约对半分：标题→断点→步骤→分段→个人记录→色标 8 格 | components/DetailPanel.tsx | board-detail-open.png / verify ✓5 |
| 双态编辑：原地变形 + 1px 下划线 + Enter/失焦提交 + Esc 还原 | components/InlineEdit.tsx | verify ✓6 |
| 互斥：近 1:1 开右收左 | store/ui.ts openDetail/toggleLeft | 代码审查 |
| 休息页：整页液态玻璃 + 灰满环▶ + 40px 等宽正计时 + 触发源回执 + 底部累计/Alt+Q + Enter 等价 | pages/RestPage.tsx | board-rest.png / board-rest-dark.png / verify ✓15 |
| 休息态 tab1 休止符小符号（SVG） | TitleBar.tsx RestMark | 休息态切 tab 后可见 |
| 数字一律等宽 | .num / tabular-nums | 全截图 |

## 宪法七条自查

1. **调度为内核**：版面全部由 q_board/segments/events 驱动，verify-wv2-m1 对真实 SQLite 全链路 PASS ✓
2. **时间默认值不计**：rest/idle/pause 闭合 segment；恢复全部显式（idle_end/rest_end/resume） ✓
3. **颜色只属于色标**：无全局强调色；tab 选中用墨色下划线；层级=字号/字重/透明度 ✓
4. **玻璃边界**：玻璃仅休息页/完成档案（盖自家内容）；无对外玻璃浮层 ✓
5. **无表单**：全部 InlineEdit 原地变形，唯一编辑指示=1px 下划线 ✓
6. **推拉不弹窗**：左右栏宽度过渡；toast 非模态；主窗无模态 ✓
7. **六原语薄接口**：组件零 @tauri-apps/api 导入（仅 src/api/*） ✓

## verify-m1.mjs 输出（15/15）

见下方"verify 输出"原文（命令 `pnpm vite dev` + `node scripts/verify-m1.mjs`）：

```
✓ 就地勾选推进 — 集成测试三件套 → 一周种子数据
✓ 完成→3s 撤销→撤销成功
✓ 完成→超时入档案 — 今日已完 · 3 件·4h 53m
✓ 档案重开回队尾 — queue=[11,12,13,14,6]
✓ 稿库开（300px 划入） — w=300
✓ 稿库收 — w=0
✓ 详情栏开 — w=563.1875
✓ 详情栏收 — w=0
✓ 双态编辑·Enter 提交 — 断点甲
✓ 双态编辑·Esc 还原 — 断点甲
✓ 新建落队尾 — 验证用新进程
✓ 拖拽排序（队尾→队首） — [12,13,14,6,22] → [22,12,13,14,6]
✓ 稿库拖入成进程 — plans 6→5, queue 5→6
✓ 空态引导语
✓ 休息页渲染
== 15/15 通过 ==
```

## 真实 WebView2（CDP :9222，种子库）

```
初始: active=改 gika 数据内核 ring=45 queue=4
切换后: active=回三封邮件
暂停后环变暗: true
撤销后: active=回三封邮件
真实接线 PASS
```

截图：wv2-board.png / wv2-detail.png / wv2-library.png（真实 WebView2）+ mock 矩阵 9 张。

> v1.1 修订后证据：docs/screenshots/v11/（胶囊导航/rail/步骤栈空圈/日滚动/淡暖底/MiSans 与 A/B 三值）；回归：verify-m1 18/18、verify-m3 v1.1 12/12、verify-m4 11/11。
