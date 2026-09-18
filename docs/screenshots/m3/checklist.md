# M3 验收 · 统计页（2026-09-19）

## 新查询清单（Rust + mock 双实现，组件零 @tauri-apps/api）

| 查询 | 语义 |
|---|---|
| `q_day_stats(day)` | 每进程切片 {process_id,title,color_tag,ms} + 总专注 + 切换次数（switch_in 计数）+ 最长单段 |
| `q_month_calendar(year,month)` | 逐日色标聚合 shares（只回有记录的日子） |
| `q_year_overview(year)` | 逐月聚合 + available_years（有记录的年份范围） |
| `q_day_view(day)` | 已做 / 进行中（步骤进度+已投）/ 未做 / 该天计划全量 / 挂起成本 |
| `q_day_grid(day)` | 96 格归属（owner/color/title/seg 起止/断点） |

## 验收断言（verify-m3.mjs，mock 14/14）

```
✓ 默认月视角锚定今天
✓ 月单击=选中不跳页
✓ 双击→日视角（日期正确）
✓ 日视图换天
✓ 点日期回月视角
✓ 切视角锚点保留 — anchor=2026-09-11
✓ 年视图有月环 — 4 个月
✓ 年点月环→月（月份正确） — 2026 年 9 月
✓ 大环总专注显示 — 2h 35m
✓ 回到今天
✓ 日网格今天有圆圈 — 12 格
✓ 悬停浮窗（进程名+起止+时长） — 改 gika 数据内核 00:30–01:27 · 57m
✓ 未来天显示尚无记录
✓ 未计时完成标记出现且不画圈 — 12→12
```

## 数据正确性抽查

- Rust 集成测试 `grid_cell_majority_ownership_and_untimed_completion`（一格两进程归多数派；未计时完成不画圈；total==各片和==segments 闭合和；switch_count=4）——cargo test 4/4 绿
- 真实库 CDP 抽查（seed:deep）：`total_ms=17288000 与 slices 和一致=true`；手工核算 28+48+192+20=288m=4h48m ✓

## 截图清单

mock（9）：stats-month / stats-bigring-today / stats-dayview / stats-daygrid-today / stats-daygrid-hover / stats-month-after-drill / stats-year / stats-month-dark（+ M1/M2 旧矩阵回归重截）
真实 WebView2（3）：wv2-stats-month.png / wv2-stats-daygrid.png / wv2-stats-year.png（seed:deep 库，189 进程 / 770 事件 / 120 天稀疏历史）

## 02 文档逐条对照

| 规格 | 实现 | 证据 |
|---|---|---|
| 视角胶囊 [年\|月\|日] 顶部居中、暖色分段（染底+脊色） | StatsPage capsule | stats-month.png |
| 进入默认月视角锚定今天 | anchor=today | verify ✓1 |
| 月历整月 7 列居中、迷你日环按色标聚合、空日不画、未来不画、今天标记 | MonthCalendar | stats-month.png |
| 大环每进程一片、无色=中性灰、图例进程名+时长、核心数字×3 | BigRing + DonutRing | stats-bigring-today.png |
| 当天视图四组 + 计划编辑与稿库同源（store-changed 同步） | DayViewSection | stats-dayview.png |
| 挂起成本（捞回/未捞回） | q_day_view.suspended_costs | stats-dayview.png |
| 日网格 12×8、每格 15 分钟、列主序、刻度 0/6/12/18 对第 0/3/6/9 列 | DayGridView（grid-auto-flow: column） | stats-daygrid-today.png |
| 空格极浅中性点（空隙即数据） | .dg-empty-dot（D22） | stats-daygrid-today.png |
| 悬停圆圈 → 实心暖卡浮窗（名/起止/时长/断点） | .dg-tip | stats-daygrid-hover.png |
| 未来日期"尚无记录" | daygrid-future | verify ✓13 |
| 未计时完成不画圈、只进当天视图清单 | grid 归 segments 独有者 | verify ✓14 + Rust 测试 |
| 年视图 12 月环、纵向滚动、点月环下钻 | YearView | stats-year.png |
| 锚点联动（切视角保留锚点） | StatsPage anchor 状态 | verify ✓6 |
| 过去日子计划可删除/直接完成 | DayViewSection 计划行 ✓/✕ | verify ✓14 链路 |

## 宪法七条自查

1. 调度为内核：统计全部派生自 segments/events 单一事实源 ✓
2. 时间默认值不计：日网格只画 focus segments；空闲/休息天然为空隙 ✓
3. 颜色只属于色标：环切片=色标/中性灰；胶囊选中用墨色；无全局强调色 ✓
4. 玻璃边界：统计页无玻璃（玻璃只在休息页/档案） ✓
5. 无表单：计划编辑是幽灵行就地回车 ✓
6. 推拉不弹窗：统计页无模态；悬停浮窗为实心暖卡非模态 ✓
7. 六原语薄接口：组件零 @tauri-apps/api ✓
