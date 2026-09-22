//! M0 集成测试：非法迁移 / 事件 append-only / switch 闭合 segment。
//! 全部用内存库 + 显式时间戳，确定性。

use fermata_lib::db::{self, ops, queries};

type EventRow = (i64, i64, String, Option<i64>, Option<String>);

fn events_snapshot(conn: &rusqlite::Connection) -> Vec<EventRow> {
    let mut stmt = conn
        .prepare("SELECT id, ts, kind, process_id, payload FROM events ORDER BY id")
        .unwrap();
    stmt.query_map([], |r| {
        Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
    })
    .unwrap()
    .map(|r| r.unwrap())
    .collect()
}

#[test]
fn illegal_transitions_rejected() {
    let conn = db::open_in_memory().unwrap();
    let t0 = 1_800_000_000_000i64;

    let a = ops::process_create(&conn, t0, "甲", None, None).unwrap();

    // 未运行不能暂停/恢复
    assert!(ops::process_pause(&conn, t0 + 1, a).is_err(), "挂起中 pause 应拒绝");
    assert!(ops::process_resume(&conn, t0 + 2, a).is_err(), "挂起中 resume 应拒绝");

    // 等AI 还原前必须先进入
    assert!(ops::waiting_ai_set(&conn, t0 + 3, a, false).is_err(), "非等AI 还原应拒绝");

    ops::process_switch(&conn, t0 + 10, a, None).unwrap();
    assert!(ops::process_switch(&conn, t0 + 11, a, None).is_err(), "运行中再切入应拒绝");

    // pause → resume 合法；重复 pause 拒绝
    ops::process_pause(&conn, t0 + 20, a).unwrap();
    assert!(ops::process_pause(&conn, t0 + 21, a).is_err(), "重复 pause 应拒绝");
    ops::process_resume(&conn, t0 + 22, a).unwrap();

    // 完成后的非法操作群
    ops::process_complete(&conn, t0 + 30, a).unwrap();
    assert!(ops::process_complete(&conn, t0 + 31, a).is_err(), "重复完成应拒绝");
    assert!(ops::process_switch(&conn, t0 + 32, a, None).is_err(), "切入已完成应拒绝");
    assert!(ops::waiting_ai_set(&conn, t0 + 33, a, true).is_err(), "已完成置等AI 应拒绝");

    // reopen 只对完成态合法
    let b = ops::process_create(&conn, t0 + 40, "乙", None, None).unwrap();
    assert!(ops::process_reopen(&conn, t0 + 41, b).is_err(), "挂起中 reopen 应拒绝");
    ops::process_reopen(&conn, t0 + 42, a).unwrap(); // 合法：完成→挂起

    // 等AI 重复置位拒绝
    ops::waiting_ai_set(&conn, t0 + 50, a, true).unwrap();
    assert!(ops::waiting_ai_set(&conn, t0 + 51, a, true).is_err(), "重复等AI 应拒绝");
    ops::waiting_ai_set(&conn, t0 + 52, a, false).unwrap();

    // 色标越界
    assert!(ops::color_set(&conn, t0 + 60, a, Some(7)).is_err(), "色标 7 应拒绝");
    ops::color_set(&conn, t0 + 61, a, Some(6)).unwrap();
}

#[test]
fn events_are_append_only() {
    let conn = db::open_in_memory().unwrap();
    let t0 = 1_800_000_000_000i64;

    let a = ops::process_create(&conn, t0, "甲", None, None).unwrap();
    ops::process_switch(&conn, t0 + 10, a, None).unwrap();
    let before = events_snapshot(&conn);
    assert!(!before.is_empty());

    // 跑一大批各类变更
    let b = ops::process_create(&conn, t0 + 20, "乙", Some(2), None).unwrap();
    ops::process_switch(&conn, t0 + 30, b, Some("甲断点")).unwrap();
    ops::breakpoint_set(&conn, t0 + 40, b, "乙断点").unwrap();
    ops::color_set(&conn, t0 + 50, b, Some(4)).unwrap();
    ops::waiting_ai_set(&conn, t0 + 60, b, true).unwrap();
    ops::waiting_ai_set(&conn, t0 + 70, b, false).unwrap();
    let s = ops::step_add(&conn, t0 + 80, b, "步骤一").unwrap();
    ops::step_check(&conn, t0 + 90, s, true).unwrap();
    ops::step_check(&conn, t0 + 91, s, false).unwrap();
    ops::steps_reorder(&conn, t0 + 92, b, &[s]).unwrap();
    ops::queue_reorder(&conn, t0 + 93, &db::day_of(t0), &[a]).unwrap();
    let pl = ops::plan_create(&conn, t0 + 100, "计划一", Some(30), None).unwrap();
    ops::plan_update(&conn, t0 + 101, pl, Some("计划一改"), None, None).unwrap();
    ops::plan_done(&conn, t0 + 102, pl).unwrap();
    let pl2 = ops::plan_create(&conn, t0 + 103, "计划二", None, None).unwrap();
    ops::plan_delete(&conn, t0 + 104, pl2).unwrap();
    ops::process_complete(&conn, t0 + 110, b).unwrap();
    ops::process_reopen(&conn, t0 + 120, b).unwrap();
    ops::process_switch(&conn, t0 + 130, b, None).unwrap();
    ops::process_pause(&conn, t0 + 140, b).unwrap();
    ops::process_resume(&conn, t0 + 150, b).unwrap();
    ops::slice_complete(&conn, t0 + 160, b).unwrap();
    ops::slice_aborted(&conn, t0 + 170, b, 60_000).unwrap();
    ops::rest_trigger(&conn, t0 + 180, Some(b), "continuous", 90 * 60_000).unwrap();
    ops::rest_choice(&conn, t0 + 181, Some(b), "rest").unwrap();
    ops::rest_start(&conn, t0 + 182, Some(b)).unwrap();
    ops::rest_end(&conn, t0 + 183, Some(b)).unwrap();
    ops::idle_start(&conn, t0 + 190, Some(b)).unwrap();
    ops::idle_end(&conn, t0 + 200, Some(b)).unwrap();

    let after = events_snapshot(&conn);
    assert!(after.len() > before.len(), "事件数应只增");
    assert_eq!(&after[..before.len()], before.as_slice(), "既有事件一行不许变");
    for w in after.windows(2) {
        assert!(w[1].0 > w[0].0, "事件 id 严格递增");
    }
}

#[test]
fn switch_closes_segment_matching_event_delta() {
    let conn = db::open_in_memory().unwrap();
    let t0 = 1_800_000_000_000i64;
    let t1 = t0 + 25 * 60_000; // 25 分钟后切走

    let a = ops::process_create(&conn, t0, "甲", None, None).unwrap();
    ops::process_switch(&conn, t0, a, None).unwrap();
    let b = ops::process_create(&conn, t0 + 1_000, "乙", None, None).unwrap();
    ops::process_switch(&conn, t1, b, Some("甲做到一半")).unwrap();

    // 甲的 segment 闭合且时长 = switch_out 与 switch_in 的事件时间差
    let (started, ended): (i64, Option<i64>) = conn
        .query_row(
            "SELECT started_at, ended_at FROM segments WHERE process_id = ?1",
            rusqlite::params![a],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(started, t0);
    assert_eq!(ended, Some(t1));

    let ts_of = |kind: &str, pid: i64| -> i64 {
        conn.query_row(
            "SELECT ts FROM events WHERE kind = ?1 AND process_id = ?2",
            rusqlite::params![kind, pid],
            |r| r.get(0),
        )
        .unwrap()
    };
    assert_eq!(t1 - t0, ts_of("switch_out", a) - ts_of("switch_in", a));

    // 甲落回挂起；断点以 note 压入栈顶
    let pa = db::get_process(&conn, a).unwrap();
    assert_eq!(pa.state, "suspended");
    let steps = conn
        .prepare("SELECT title, kind FROM steps WHERE process_id = ?1 ORDER BY position")
        .unwrap()
        .query_map(rusqlite::params![a], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .unwrap()
        .map(|r| r.unwrap())
        .collect::<Vec<_>>();
    assert_eq!(steps.first().map(|(t, k)| (t.as_str(), k.as_str())), Some(("甲做到一半", "note")));
    assert!(pa.queue_position.is_some());

    // 乙在运行且有开口段；甲当天累计 = 25min
    let pb = db::get_process(&conn, b).unwrap();
    assert_eq!(pb.state, "running");
    let day = db::day_of(t0);
    // q_process_day_total 的开口段以真实 now 计，这里只验甲的闭合段
    assert_eq!(queries::q_process_day_total(&conn, a, &day).unwrap(), 25 * 60_000);
}

// ================= M3 统计内核测试 =================

#[test]
fn grid_cell_majority_ownership_and_untimed_completion() {
    let conn = db::open_in_memory().unwrap();
    // 锚定昨天（本地时区 10:00 起，第 40 格 = 10:00–10:15）：
    // 全部时段恒在过去，q_day_grid v1.4 的"占用止点钳到当下"不会钳掉夜里段
    let base = {
        let today = db::today_local();
        let (s, _) = db::day_range(&today).unwrap();
        s - 86_400_000
    };
    let t = |mins: i64| base + mins * 60_000;
    let day = db::day_of(base);

    let a = ops::process_create(&conn, t(0), "甲占多数", Some(1), Some(&day)).unwrap();
    let b = ops::process_create(&conn, t(0), "乙占少数", Some(2), Some(&day)).unwrap();

    // 甲在 10:00–10:10 运行（格 24 = 10:00–10:10 占 10 分钟），乙 10:05–10:07（格 24 占 2 分钟）
    ops::process_switch(&conn, t(600), a, None).unwrap(); // 10:00
    ops::process_switch(&conn, t(607), b, None).unwrap(); // 10:07 切走甲
    ops::process_switch(&conn, t(610), a, None).unwrap(); // 10:10 切回甲
    ops::process_switch(&conn, t(615), b, None).unwrap(); // 10:15

    let grid = queries::q_day_grid(&conn, &day).unwrap();
    assert_eq!(grid.len(), 108, "18×6=108 格");
    let cell24 = &grid[24];
    // v1.4 marks 口径：格 24 甲 7 分钟（70%）居首、乙 3 分钟（30%）次席，对角分半
    assert_eq!(cell24.marks.first().map(|m| m.process_id), Some(a), "格 24 首枚=多数派甲");
    assert_eq!(cell24.marks.first().and_then(|m| m.color_tag), Some(1));
    assert_eq!(cell24.marks.get(1).map(|m| m.process_id), Some(b), "格 24 次席=乙");
    // 0–6 点窗口外不画：格 0 = 06:00–06:10
    assert!(grid[0].marks.is_empty());

    // 未计时完成（零 segment）不画圈
    let c = ops::process_create(&conn, t(700), "丙零时长", None, Some(&day)).unwrap();
    ops::process_complete(&conn, t(701), c).unwrap();
    let grid2 = queries::q_day_grid(&conn, &day).unwrap();
    assert!(
        grid2.iter().all(|cell| cell.marks.iter().all(|m| m.process_id != c)),
        "未计时完成不画圈"
    );

    // 跨午夜截断：23:50–00:20 的分段，在 06:00 起的时窗内只有跨 0 点段不进当天窗口
    let night = ops::process_create(&conn, t(1430), "夜里赶工", None, Some(&day)).unwrap();
    ops::process_switch(&conn, t(1430), night, None).unwrap(); // 23:50
    ops::process_switch(&conn, t(1440) - 1, b, None).unwrap(); // 24:00 前切走
    let grid3 = queries::q_day_grid(&conn, &day).unwrap();
    // 23:50–23:59:59 在窗口内：格 107（23:50–24:00）
    assert!(
        grid3[107].marks.iter().any(|m| m.process_id == night),
        "跨午夜段在窗口内部分照常"
    );
    assert!(grid3.iter().take(107).all(|c| c.marks.iter().all(|m| m.process_id != night)));

    // q_day_stats 自洽：total == 各切片之和 == segments 闭合和
    let stats = queries::q_day_stats(&conn, &day).unwrap();
    let sum: i64 = stats.slices.iter().map(|s| s.ms).sum();
    assert_eq!(stats.total_ms, sum);
    let seg_sum: i64 = {
        let mut stmt = conn.prepare("SELECT started_at, ended_at FROM segments WHERE day = ?1").unwrap();
        stmt.query_map(rusqlite::params![day], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, Option<i64>>(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .map(|(s, e)| (e.unwrap_or_else(db::now_ms) - s).max(0))
            .sum()
    };
    assert_eq!(stats.total_ms, seg_sum, "大环总专注 == segments 闭合和");
    // 切换次数 = switch_in 计数（含跨午夜验收段的两次）= 6
    assert_eq!(stats.switch_count, 6);

    // v1.4.1 整格全量清单：格 12（08:00–08:10，乙的长段 10:15 起、不覆盖）排 5 个占用者——
    // 丁 5 分钟、戊 2 分钟、己 1.5 分钟、庚 1 分钟、辛 0.5 分钟（后三 <20%）
    let mk = |name: &str| ops::process_create(&conn, t(0), name, None, Some(&day)).unwrap();
    let (d4, e5, f6, g7, h8) = (mk("丁"), mk("戊"), mk("己"), mk("庚"), mk("辛"));
    // 轮转切：丁[480,484) 戊[484,486) 己[486,487.5) 庚[487.5,488.5) 辛[488.5,489) 丁收[489,490)
    ops::process_switch(&conn, t(480), d4, None).unwrap();
    ops::process_switch(&conn, t(484), e5, None).unwrap();
    ops::process_switch(&conn, t(486), f6, None).unwrap();
    ops::process_switch(&conn, t(487) + 30_000, g7, None).unwrap();
    ops::process_switch(&conn, t(488) + 30_000, h8, None).unwrap();
    ops::process_switch(&conn, t(489), d4, None).unwrap();
    ops::process_switch(&conn, t(490), a, None).unwrap(); // 收
    let grid4 = queries::q_day_grid(&conn, &day).unwrap();
    let cell12 = &grid4[12];
    // 画布：≥20% 前二 = 丁(50%) 戊(20%)
    assert_eq!(cell12.marks.len(), 2, "3+ 占用者仍只画两瓣");
    assert_eq!(cell12.marks[0].process_id, d4);
    assert_eq!(cell12.marks[1].process_id, e5);
    // 清单：全部 5 个占用者，截前 4 + occupant_count=5；<20% 的己庚也在列
    assert_eq!(cell12.occupant_count, 5, "格 12 共 5 个占用者");
    assert_eq!(cell12.occupants.len(), 4, "清单截前 4");
    let ids: Vec<i64> = cell12.occupants.iter().map(|o| o.process_id).collect();
    assert_eq!(ids, vec![d4, e5, f6, g7], "按时长降序前 4（辛 0.5 分钟被截）");
    assert!(cell12.occupants[2].share < 0.2, "己 15% 也列出（阈值只管画）");
    // 钳制区间：丁两段并集 = [08:00, 08:04] ∪ [08:09, 08:10] → 钳制起止 08:00–08:10
    assert_eq!(cell12.occupants[0].occ_start, t(480));
    assert_eq!(cell12.occupants[0].occ_end, t(490));
}

// ================= v1.4.2 · 格朝向 = 相邻格占用判定 =================

#[test]
fn day_grid_orientation_by_neighbor_occupancy() {
    let conn = db::open_in_memory().unwrap();
    let base = {
        let today = db::today_local();
        let (s, _) = db::day_range(&today).unwrap();
        s - 86_400_000
    };
    let t = |mins: i64| base + mins * 60_000;
    let day = db::day_of(base);

    // 甲：格 30 全格 + 格 31 被打断成三截 + 格 32 一截（格 N 起点 = 06:00+N×10min = t(360+10N)）
    let a = ops::process_create(&conn, t(0), "甲", None, Some(&day)).unwrap();
    let x = ops::process_create(&conn, t(0), "乙", None, Some(&day)).unwrap();
    ops::process_switch(&conn, t(660), a, None).unwrap(); // 11:00 甲起（格 30 全格）
    ops::process_switch(&conn, t(673), x, None).unwrap(); // 11:13 切乙（格 31 内打断）
    ops::process_switch(&conn, t(674), a, None).unwrap(); // 11:14 切回甲
    ops::process_switch(&conn, t(676), x, None).unwrap(); // 11:16 再切乙
    ops::process_switch(&conn, t(677), a, None).unwrap(); // 11:17 切回甲
    ops::process_switch(&conn, t(685), x, None).unwrap(); // 11:25 甲止于格 32 内

    let grid = queries::q_day_grid(&conn, &day).unwrap();
    let mark31 = grid[31].marks.iter().find(|m| m.process_id == a).expect("格 31 有甲");
    assert!(!mark31.is_start && !mark31.is_end, "格 31 前后都有甲 → 中段（不翻边）");
    let mark30 = grid[30].marks.iter().find(|m| m.process_id == a).expect("格 30 有甲");
    assert!(mark30.is_start && !mark30.is_end, "格 30 前无后有 → 段起");
    let mark32 = grid[32].marks.iter().find(|m| m.process_id == a).expect("格 32 有甲");
    assert!(!mark32.is_start && mark32.is_end, "格 32 前有后无 → 段止");

    // 孤立单格：既是段起也是段止（前端单枚逻辑 is_end 优先 → 左上）
    let solo = ops::process_create(&conn, t(0), "孤立", None, Some(&day)).unwrap();
    ops::process_switch(&conn, t(962), solo, None).unwrap(); // 16:02（格 60）
    ops::process_switch(&conn, t(965), x, None).unwrap(); // 16:05
    let grid2 = queries::q_day_grid(&conn, &day).unwrap();
    let m = grid2[60].marks.iter().find(|m| m.process_id == solo).expect("格 60 有孤立");
    assert!(m.is_start && m.is_end, "孤立单格 = 段起兼段止");
}

// ================= v1.2 · 统一栈（ADR-0005） =================

#[test]
fn unified_stack_note_and_steps() {
    let conn = db::open_in_memory().unwrap();
    let t0 = 1_800_000_000_000i64;
    let day = db::day_of(t0);

    let p = ops::process_create(&conn, t0, "统一栈", None, Some(&day)).unwrap();
    let s1 = ops::step_add(&conn, t0 + 1, p, "步骤一").unwrap();
    let s2 = ops::step_add(&conn, t0 + 2, p, "步骤二").unwrap();

    // 新步骤置顶
    let bp = queries::q_board(&conn, &day).unwrap().suspended.into_iter().find(|x| x.process.id == p).unwrap();
    let order: Vec<i64> = bp.steps.iter().map(|x| x.id).collect();
    assert_eq!(order, vec![s2, s1], "步骤栈新步骤置顶");
    assert_eq!(bp.stack_top.as_ref().map(|t| t.title.as_str()), Some("步骤二"));
    assert_eq!(bp.stack_top.as_ref().map(|t| t.kind.as_str()), Some("step"));

    // 写断点 = 压 note 到栈顶
    ops::breakpoint_set(&conn, t0 + 3, p, "等评审意见").unwrap();
    let bp = queries::q_board(&conn, &day).unwrap().suspended.into_iter().find(|x| x.process.id == p).unwrap();
    assert_eq!(bp.stack_top.as_ref().map(|t| (t.title.as_str(), t.kind.as_str())), Some(("等评审意见", "note")));
    assert_eq!(bp.steps.len(), 3, "note 与步骤同栈");

    // 事件口径：entry_add / 不再有 breakpoint_set
    let evts = queries::q_events(&conn, None).unwrap();
    assert!(evts.iter().any(|e| e.kind == "entry_add" && e.payload.as_deref().unwrap_or("").contains("note")));
    assert!(!evts.iter().any(|e| e.kind == "breakpoint_set"));

    // entry_delete 删断点条 → 导语回步骤
    let note_id = bp.steps.iter().find(|x| x.kind == "note").unwrap().id;
    ops::entry_delete(&conn, t0 + 4, note_id).unwrap();
    let bp = queries::q_board(&conn, &day).unwrap().suspended.into_iter().find(|x| x.process.id == p).unwrap();
    assert_eq!(bp.stack_top.as_ref().map(|t| t.title.as_str()), Some("步骤二"));

    // 勾选栈顶步骤 → 导语推进到下一未完成
    ops::step_check(&conn, t0 + 5, s2, true).unwrap();
    let bp = queries::q_board(&conn, &day).unwrap().suspended.into_iter().find(|x| x.process.id == p).unwrap();
    assert_eq!(bp.stack_top.as_ref().map(|t| t.title.as_str()), Some("步骤一"));
}

// ================= 条目改文（步骤/断点条通用） =================

#[test]
fn entry_rename_renames_step_and_note() {
    let conn = db::open_in_memory().unwrap();
    let t0 = 1_800_000_000_000i64;
    let day = db::day_of(t0);
    let p = ops::process_create(&conn, t0, "改名", None, Some(&day)).unwrap();
    let s1 = ops::step_add(&conn, t0 + 1, p, "旧步骤名").unwrap();
    ops::breakpoint_set(&conn, t0 + 2, p, "旧断点").unwrap();

    // 改步骤 + 改断点条
    ops::entry_rename(&conn, t0 + 3, s1, "新步骤名").unwrap();
    let bp = queries::q_board(&conn, &day).unwrap().suspended.into_iter().find(|x| x.process.id == p).unwrap();
    let note_id = bp.steps.iter().find(|x| x.kind == "note").unwrap().id;
    ops::entry_rename(&conn, t0 + 4, note_id, "新断点").unwrap();

    let bp = queries::q_board(&conn, &day).unwrap().suspended.into_iter().find(|x| x.process.id == p).unwrap();
    assert_eq!(bp.stack_top.as_ref().map(|t| t.title.as_str()), Some("新断点"), "改栈顶断点条 = 改导语");
    assert!(bp.steps.iter().any(|x| x.title == "新步骤名"));

    // 空标题拒绝；事件记全
    assert!(ops::entry_rename(&conn, t0 + 5, s1, "   ").is_err());
    let evts = queries::q_events(&conn, None).unwrap();
    assert_eq!(evts.iter().filter(|e| e.kind == "entry_rename").count(), 2);
}

// ================= v1.2 · 缺陷 B1：idle_end 守卫（恢复误删） =================

#[test]
fn idle_end_only_reopens_idle_closed_timer() {
    let conn = db::open_in_memory().unwrap();
    let t0 = 1_800_000_000_000i64;
    let day = db::day_of(t0);
    let p = ops::process_create(&conn, t0, "守卫测试", None, Some(&day)).unwrap();
    ops::process_switch(&conn, t0 + 1, p, None).unwrap();

    let open_segs = |conn: &rusqlite::Connection| -> i64 {
        conn.query_row(
            "SELECT COUNT(*) FROM segments WHERE process_id = ?1 AND ended_at IS NULL",
            rusqlite::params![p], |r| r.get(0),
        ).unwrap()
    };

    // 手动暂停后 idle_end：不得重开
    ops::process_pause(&conn, t0 + 10, p).unwrap();
    assert_eq!(open_segs(&conn), 0);
    ops::idle_end(&conn, t0 + 20, Some(p)).unwrap();
    assert_eq!(open_segs(&conn), 0, "手动暂停后 idle_end 不得重开计时");

    // 恢复 → 休息 → idle_end：不得重开
    ops::process_resume(&conn, t0 + 30, p).unwrap();
    ops::rest_start(&conn, t0 + 40, Some(p)).unwrap();
    ops::idle_end(&conn, t0 + 50, Some(p)).unwrap();
    assert_eq!(open_segs(&conn), 0, "休息中 idle_end 不得重开计时");
    ops::rest_end(&conn, t0 + 60, Some(p)).unwrap();
    assert_eq!(open_segs(&conn), 1);

    // 空闲停 → idle_end：正常重开
    ops::idle_start(&conn, t0 + 70, Some(p)).unwrap();
    assert_eq!(open_segs(&conn), 0);
    ops::idle_end(&conn, t0 + 80, Some(p)).unwrap();
    assert_eq!(open_segs(&conn), 1, "空闲停的计时 idle_end 正常重开");
}

// ================= dev 定点：MRU 队首 =================

#[test]
fn switched_out_lands_queue_head() {
    let conn = db::open_in_memory().unwrap();
    let t0 = 1_800_000_000_000i64;
    let day = db::day_of(t0);
    let a = ops::process_create(&conn, t0, "甲", None, Some(&day)).unwrap();
    let b = ops::process_create(&conn, t0 + 1, "乙", None, Some(&day)).unwrap();
    let c = ops::process_create(&conn, t0 + 2, "丙", None, Some(&day)).unwrap();
    // 队列：甲1 乙2 丙3；切甲运行
    ops::process_switch(&conn, t0 + 10, a, None).unwrap();
    // 切乙：甲应落队首（position 1），其余后移
    ops::process_switch(&conn, t0 + 20, b, None).unwrap();
    let pa = db::get_process(&conn, a).unwrap();
    assert_eq!(pa.queue_position, Some(1), "被切走的甲落挂起队首（MRU）");
    // 新建仍落队尾（MRU 移位后位置可有空隙，新建取最大+1）
    let d = ops::process_create(&conn, t0 + 30, "丁", None, Some(&day)).unwrap();
    let pd = db::get_process(&conn, d).unwrap();
    let pc = db::get_process(&conn, c).unwrap();
    assert!(pd.queue_position.unwrap() > pc.queue_position.unwrap(), "新建仍落队尾");
    assert!(pc.queue_position.unwrap() > pa.queue_position.unwrap());
}

// ================= fix/plan-ops：计划四修 =================

#[test]
fn plan_reopen_and_day_view_filters_deleted() {
    let conn = db::open_in_memory().unwrap();
    let t0 = 1_800_000_000_000i64;
    let day = db::day_of(t0);

    let p1 = ops::plan_create(&conn, t0, "待改计划", Some(30), Some(&day)).unwrap();
    let p2 = ops::plan_create(&conn, t0 + 1, "要删计划", None, Some(&day)).unwrap();

    // 删除即消失：deleted 不出现在 q_day_view
    ops::plan_delete(&conn, t0 + 2, p2).unwrap();
    let dv = queries::q_day_view(&conn, &day).unwrap();
    assert!(
        dv.plans.iter().all(|p| p.id != p2),
        "deleted 计划不得出现在 q_day_view"
    );
    assert!(dv.plans.iter().any(|p| p.id == p1), "pool 计划仍在");

    // 完成 → 放回稿库：回 pool、completed_at 清空、插回原位
    ops::plan_done(&conn, t0 + 3, p1).unwrap();
    let dv = queries::q_day_view(&conn, &day).unwrap();
    assert!(dv.not_done.iter().all(|p| p.id != p1), "完成态不在未做清单");
    let prev: Option<i64> = conn
        .query_row("SELECT prev_position FROM plans WHERE id = ?1", rusqlite::params![p1], |r| r.get(0))
        .unwrap();
    assert_eq!(prev, Some(1), "plan_done 记位 prev_position");

    // 期间新增一条（落队尾），回退仍应插回原位（原位未越界）
    let p3 = ops::plan_create(&conn, t0 + 35, "插队计划", None, Some(&day)).unwrap();
    ops::plan_reopen(&conn, t0 + 4, p1).unwrap();
    let order: Vec<String> = {
        let mut stmt = conn.prepare("SELECT title FROM plans WHERE state = 'pool' ORDER BY position, id").unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect()
    };
    assert_eq!(order, vec!["待改计划", "插队计划"], "回退插回原位（队首），新增让位");
    let (state, completed_at): (String, Option<i64>) = conn
        .query_row("SELECT state, completed_at FROM plans WHERE id = ?1", rusqlite::params![p1], |r| Ok((r.get(0)?, r.get(1)?)))
        .unwrap();
    assert_eq!(state, "pool");
    assert_eq!(completed_at, None);
    let dv = queries::q_day_view(&conn, &day).unwrap();
    assert!(dv.not_done.iter().any(|p| p.id == p1), "回退后回未做清单");

    // 夹紧：prev_position 越界（期间队列变短）→ min(prev, len)
    ops::plan_done(&conn, t0 + 5, p3).unwrap(); // p3 原位 2 → prev=2
    ops::plan_done(&conn, t0 + 6, p1).unwrap(); // p1 原位 1 → prev=1；pool 空
    ops::plan_reopen(&conn, t0 + 7, p3).unwrap(); // len=0 → 夹到唯一位
    let order: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM plans WHERE state = 'pool' ORDER BY position, id").unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect()
    };
    assert_eq!(order, vec![p3], "空队列回退落唯一位");
    ops::plan_reopen(&conn, t0 + 8, p1).unwrap(); // prev=1, len=1 → min=1 → 队首
    let order: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM plans WHERE state = 'pool' ORDER BY position, id").unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect()
    };
    assert_eq!(order, vec![p1, p3], "夹紧到 min(prev,len)：p1 回队首");

    // 分数位插入：reopen 不改他人 position；反复 done/reopen 相对顺序稳定
    let pos_of = |id: i64| -> f64 {
        conn.query_row("SELECT COALESCE(position,0) FROM plans WHERE id = ?1", rusqlite::params![id], |r| r.get(0))
            .unwrap()
    };
    let p4 = ops::plan_create(&conn, t0 + 10, "丁", None, Some(&day)).unwrap();
    let p5 = ops::plan_create(&conn, t0 + 11, "戊", None, Some(&day)).unwrap();
    // pool: p1 p3 p4 p5；完成中间的 p3 再回退
    let before: Vec<(i64, f64)> = vec![p1, p3, p4, p5].into_iter().map(|x| (x, pos_of(x))).collect();
    ops::plan_done(&conn, t0 + 12, p3).unwrap();
    ops::plan_reopen(&conn, t0 + 13, p3).unwrap();
    assert_eq!(pos_of(p1), before[0].1, "他人 position 不被重写（p1）");
    assert_eq!(pos_of(p4), before[2].1, "他人 position 不被重写（p4）");
    assert_eq!(pos_of(p5), before[3].1, "他人 position 不被重写（p5）");
    let order: Vec<i64> = {
        let mut stmt = conn.prepare("SELECT id FROM plans WHERE state = 'pool' ORDER BY position, id").unwrap();
        stmt.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect()
    };
    assert_eq!(order, vec![p1, p3, p4, p5], "回退后相对顺序不变");
    // 再来三轮 done/reopen 往返，顺序仍不变
    for k in 0..3 {
        ops::plan_done(&conn, t0 + 20 + k * 2, p3).unwrap();
        ops::plan_reopen(&conn, t0 + 21 + k * 2, p3).unwrap();
        let ord: Vec<i64> = {
            let mut stmt = conn.prepare("SELECT id FROM plans WHERE state = 'pool' ORDER BY position, id").unwrap();
            stmt.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect()
        };
        assert_eq!(ord, vec![p1, p3, p4, p5], "往返 {k} 后顺序不变");
    }

    // 守卫：非完成态不能回退；事件已记
    assert!(ops::plan_reopen(&conn, t0 + 30, p1).is_err(), "pool 态不能再 reopen");
    let evts = queries::q_events(&conn, None).unwrap();
    assert!(evts.iter().any(|e| e.kind == "plan_reopen"), "写 plan_reopen 事件");
}

// ================= 数据快照（feature/data-port） =================

#[test]
fn snapshot_roundtrip_preserves_ids_and_fractional_position() {
    let conn = db::open_in_memory().unwrap();
    let t0 = 1_800_000_000_000i64;
    let day = db::day_of(t0);
    let a = ops::process_create(&conn, t0, "甲进程", Some(2), Some(&day)).unwrap();
    let b = ops::process_create(&conn, t0 + 1, "乙进程", None, Some(&day)).unwrap();
    ops::process_switch(&conn, t0 + 10, a, None).unwrap();
    ops::process_switch(&conn, t0 + 20, b, Some("甲的断点")).unwrap();
    let p1 = ops::plan_create(&conn, t0 + 30, "计划甲", Some(30), Some(&day)).unwrap();
    ops::plan_create(&conn, t0 + 31, "计划乙", None, Some(&day)).unwrap();
    ops::plan_done(&conn, t0 + 32, p1).unwrap();
    ops::plan_reopen(&conn, t0 + 33, p1).unwrap(); // 回原位 → 分数位 position
    let pos_before: f64 = conn
        .query_row("SELECT position FROM plans WHERE id = ?1", rusqlite::params![p1], |r| r.get(0))
        .unwrap();

    let snap = db::snapshot::build_snapshot(&conn).unwrap();
    let ev_count = queries::q_events(&conn, None).unwrap().len();
    assert!(ev_count > 0, "事件必须在快照里（统计的粮食）");

    let conn2 = db::open_in_memory().unwrap();
    db::snapshot::import_snapshot(&conn2, &snap).unwrap();

    // 行级一致：进程 id/标题逐行相同；事件计数相同；分数位 position 不变
    let procs: Vec<(i64, String)> = {
        let mut s = conn2.prepare("SELECT id, title FROM processes ORDER BY id").unwrap();
        s.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect()
    };
    assert_eq!(procs, vec![(a, "甲进程".to_string()), (b, "乙进程".to_string())], "id 与标题保真");
    assert_eq!(queries::q_events(&conn2, None).unwrap().len(), ev_count);
    let pos_after: f64 = conn2
        .query_row("SELECT position FROM plans WHERE id = ?1", rusqlite::params![p1], |r| r.get(0))
        .unwrap();
    assert_eq!(pos_before, pos_after, "REAL 分数位 roundtrip 无损");
    // settings/palette 也过来了
    let theme: Option<String> = conn2
        .query_row("SELECT value FROM settings WHERE key = 'theme'", [], |r| r.get(0))
        .ok();
    assert!(theme.is_some(), "settings 随快照迁移");
}

#[test]
fn snapshot_invalid_rejected_and_db_untouched() {
    let conn = db::open_in_memory().unwrap();
    let t0 = 1_800_000_000_000i64;
    let day = db::day_of(t0);
    ops::plan_create(&conn, t0, "别让坏文件碰我", None, Some(&day)).unwrap();
    let before: i64 = conn.query_row("SELECT COUNT(*) FROM plans", [], |r| r.get(0)).unwrap();

    // 顶层非对象
    let bad = serde_json::json!(["not", "snapshot"]);
    assert!(db::snapshot::import_snapshot(&conn, &bad).is_err());
    // 版本不符
    let mut snap = db::snapshot::build_snapshot(&conn).unwrap();
    snap["meta"]["format_version"] = serde_json::json!(99);
    assert!(db::snapshot::import_snapshot(&conn, &snap).is_err());
    // 缺表
    let mut snap2 = db::snapshot::build_snapshot(&conn).unwrap();
    snap2.as_object_mut().unwrap().remove("events");
    assert!(db::snapshot::import_snapshot(&conn, &snap2).is_err());

    let after: i64 = conn.query_row("SELECT COUNT(*) FROM plans", [], |r| r.get(0)).unwrap();
    assert_eq!(before, after, "非法快照零副作用");
}

// ---------- 存储位置（指针文件 + 切换） ----------

#[test]
fn data_location_resolve_priority_and_pointer() {
    let dir = std::env::temp_dir().join(format!("fermata-loc-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    // 默认 = app_dir/fermata.db
    assert_eq!(db::location::resolve(&dir), dir.join("fermata.db"));
    // 指针文件存在且目标存在 → 用指针
    let custom = dir.join("custom").join("fermata.db");
    std::fs::create_dir_all(custom.parent().unwrap()).unwrap();
    db::open(&custom).unwrap();
    std::fs::write(db::location::pointer_path(&dir), custom.to_string_lossy().as_bytes()).unwrap();
    assert_eq!(db::location::resolve(&dir), custom);
    // 指针目标不存在 → 回落默认（不写死路）
    std::fs::write(db::location::pointer_path(&dir), b"Z:/nonexistent/fermata.db").unwrap();
    assert_eq!(db::location::resolve(&dir), dir.join("fermata.db"));
    // reset 清指针回默认
    let back = db::location::reset(&dir).unwrap();
    assert_eq!(back, dir.join("fermata.db"));
    assert!(!db::location::pointer_path(&dir).exists());
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn data_location_switch_copy_and_adopt() {
    let dir = std::env::temp_dir().join(format!("fermata-loc-switch-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let app_dir = dir.join("app");
    let d1 = dir.join("d1");
    let d2 = dir.join("d2");
    std::fs::create_dir_all(&app_dir).unwrap();
    std::fs::create_dir_all(&d1).unwrap();
    std::fs::create_dir_all(&d2).unwrap();

    // 源库有点内容
    let src = app_dir.join("fermata.db");
    let conn = db::open(&src).unwrap();
    let t0 = 1_800_000_000_000i64;
    let day = db::day_of(t0);
    ops::process_create(&conn, t0, "迁移甲", None, Some(&day)).unwrap();

    // 切到空目录 → 复制迁移，原库不动
    let (p, adopted) = db::location::switch(&conn, &src, &app_dir, &d1).unwrap();
    assert!(!adopted, "空目录应是复制迁移");
    assert!(p.exists());
    let conn_new = db::open(&p).unwrap();
    let n: i64 = conn_new.query_row("SELECT COUNT(*) FROM processes", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 1, "复制后内容完整");
    let ptr = std::fs::read_to_string(db::location::pointer_path(&app_dir)).unwrap();
    assert_eq!(ptr.trim(), p.to_string_lossy());

    // 目标目录已有库 → 接续，不覆盖不合并
    let existing = d2.join("fermata.db");
    {
        let c = db::open(&existing).unwrap();
        ops::process_create(&c, t0, "老库进程", None, Some(&day)).unwrap();
    }
    let (p2, adopted2) = db::location::switch(&conn_new, &p, &app_dir, &d2).unwrap();
    assert!(adopted2, "已有库应接续");
    let conn2 = db::open(&p2).unwrap();
    let titles: Vec<String> = {
        let mut s = conn2.prepare("SELECT title FROM processes").unwrap();
        s.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect()
    };
    assert_eq!(titles, vec!["老库进程".to_string()], "接续已有库，不覆盖不合并");

    let _ = std::fs::remove_dir_all(&dir);
}
