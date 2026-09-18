# M0 验收 · 数据内核（2026-09-19）

## 范围

SQLite（rusqlite bundled）数据内核：schema v1 迁移、append-only 事件日志、状态机命令层（全 async）、一周种子、四问查询。

## 测试（cargo test 全绿）

命令：`cargo test --manifest-path src-tauri/Cargo.toml`

```
running 3 tests
test illegal_transitions_rejected ... ok
test events_are_append_only ... ok
test switch_closes_segment_matching_event_delta ... ok
test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.03s
```

- `illegal_transitions_rejected`：挂起中 pause/resume、非等AI 还原、运行中再切入、重复 pause、重复完成、切入已完成、已完成置等AI、挂起中 reopen、重复等AI、色标越界——全部按预期拒绝
- `events_are_append_only`：27 次各类变更后事件表旧行逐字节不变、id 严格递增（代码库无 UPDATE/DELETE events 的函数）
- `switch_closes_segment_matching_event_delta`：切换闭合 segment，时长 = switch_out 与 switch_in 事件时间差；切出方落回挂起队尾并带断点

## 四问验收（种子库实查）

命令：

```
pnpm seed            # GIKA_DB_PATH 默认 ./src-tauri/gika-seed.db
GIKA_AS_OF=$(date -d "today 18:30" +%s)000 pnpm verify:m0
```

（种子当天时间线按固定钟点写入——见 deviation D9；GIKA_AS_OF 注入验收时刻）

输出原文：

```
库: ./gika-seed.db  今天 = 2026-09-19  as-of = 1789813800000

== q_board(2026-09-19) ==
  运行中: #22 改 gika 数据内核（步骤 4 个）
  挂起: #21 回三封邮件（断点：已回两封，剩财务那封）
  挂起: #23 写周报
  挂起: #24 读《形式的起源》第 4 章
  挂起: #25 等 AI 跑财报数据 [等AI]
  已完: #19 晨间规划：排今天的版面
  已完: #20 审 PR #142：断点续传

Q1 「#22 改 gika 数据内核」当天累计用时 = 6h 22m（22928000 ms）
Q2 「#21 回三封邮件」当天挂起时长 = 8h 5m（29100000 ms，含当前开口区间）
Q3 「#22 改 gika 数据内核」时间片: 完成 4 / 提前切走 1（完成率 80%）
Q4 当天连续工作时长 = 3h 10m（11400000 ms）
```

手工核对：
- Q1 = 闭合段 45+47+55+45=192m + 开口段 15:20→18:30=190m = 382m = 6h22m ✓
- Q2 = 10:05→14:00（3h55m，创建到首次切入）+ 14:20→18:30（4h10m，切出至今）= 485m = 8h05m ✓（等AI 进程 #25 的老化区间按 D4 剔除，可另查为 0）
- Q3 = slice_complete×4 / slice_aborted×1，与种子事件一致 ✓
- Q4 = 最后 rest_end 15:20 → 18:30 的运行开口段 = 190m = 3h10m ✓

种子规模：processes=25 plans=7 steps=7 segments=46 events=196（过去 6 天每天 2–4 进程 + 今天 7 进程；plans 跨昨天/今天/明天/后天）。
