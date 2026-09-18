//! M0 集成测试：非法迁移 / 事件 append-only / switch 闭合 segment。
//! 全部用内存库 + 显式时间戳，确定性。

use gika_lib::db::{self, ops, queries};

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

    // 甲落回挂起且有断点与队列位
    let pa = db::get_process(&conn, a).unwrap();
    assert_eq!(pa.state, "suspended");
    assert_eq!(pa.breakpoint.as_deref(), Some("甲做到一半"));
    assert!(pa.queue_position.is_some());

    // 乙在运行且有开口段；甲当天累计 = 25min
    let pb = db::get_process(&conn, b).unwrap();
    assert_eq!(pb.state, "running");
    let day = db::day_of(t0);
    // q_process_day_total 的开口段以真实 now 计，这里只验甲的闭合段
    assert_eq!(queries::q_process_day_total(&conn, a, &day).unwrap(), 25 * 60_000);
}
