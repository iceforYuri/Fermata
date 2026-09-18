//! 种子：一周示例数据。复用 db::ops（事件流与 segments 自动自洽）。
//! 用法：GIKA_DB_PATH=可选覆盖路径 pnpm seed
//! 注意：当天时间线按固定钟点写入；深夜运行会出现"未来"时刻，属预期（为 M1 截图备料）。

use chrono::{Datelike, Duration, Local, TimeZone};
use gika_lib::db::{self, ops};
use rusqlite::Connection;

/// 第 day_off 天（0=今天，-1=昨天…）的 h:mm → epoch ms
fn at(day_off: i64, h: u32, m: u32) -> i64 {
    let today = Local::now().date_naive();
    let date = today + Duration::days(day_off);
    Local
        .with_ymd_and_hms(date.year(), date.month(), date.day(), h, m, 0)
        .single()
        .unwrap()
        .timestamp_millis()
}

fn day_str(day_off: i64) -> String {
    db::day_of(at(day_off, 12, 0))
}

/// 一次完整休息循环：触发 → 选择 → 休息 → 回来
fn rest_cycle(c: &Connection, day_off: i64, start_min: u32, pid: i64, rest_min: i64) {
    let t0 = at(day_off, start_min / 60, start_min % 60);
    ops::rest_trigger(c, t0, Some(pid), "ring_full", 45 * 60_000).unwrap();
    ops::rest_choice(c, t0 + 2_000, Some(pid), "rest").unwrap();
    ops::rest_start(c, t0 + 4_000, Some(pid)).unwrap();
    ops::rest_end(c, t0 + rest_min * 60_000, Some(pid)).unwrap();
}

fn lunch_idle(c: &Connection, day_off: i64, pid: i64) {
    ops::idle_start(c, at(day_off, 12, 15), Some(pid)).unwrap();
    ops::idle_end(c, at(day_off, 13, 5), Some(pid)).unwrap();
}

/// 过往工作日的通用骨架：各自时刻建进程 → 依次切换工作（中途一次环走满+休息）→ 完成
fn work_day(
    c: &Connection,
    day_off: i64,
    items: &[(&str, Option<i64>, u32, u32, u32, u32)], // 标题, 色标, 起h, 起m, 止h, 止m
    lunch_on_first: bool,
) {
    let day = day_str(day_off);
    let mut pids = Vec::new();
    for (i, &(title, color, sh, sm, eh, em)) in items.iter().enumerate() {
        let pid = ops::process_create(c, at(day_off, sh, sm), title, color, Some(&day)).unwrap();
        ops::process_switch(
            c,
            at(day_off, sh, sm) + 60_000,
            pid,
            if i == 0 { None } else { Some("告一段落") },
        )
        .unwrap();
        let start_min = sh * 60 + sm;
        let end_min = eh * 60 + em;
        if start_min + 30 < end_min {
            ops::slice_complete(c, at(day_off, (start_min + 25) / 60, (start_min + 25) % 60), pid).unwrap();
            rest_cycle(c, day_off, start_min + 25, pid, 12);
        }
        if lunch_on_first && i == 0 {
            lunch_idle(c, day_off, pid);
        }
        ops::process_complete(c, at(day_off, eh, em), pid).unwrap();
        pids.push(pid);
    }
}

// 简单确定性伪随机（LCG），保证 --deep 数据可复现
struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn below(&mut self, n: u64) -> u64 {
        self.next() % n
    }
}

/// --deep：过去 ~120 天稀疏数据（每周 3–5 天有记录、每天 1–3 进程）
fn seed_deep(conn: &Connection) {
    const TITLES: &[&str] = &[
        "写方案章节", "改 bug 单", "读论文", "回邮件", "代码评审", "整理纪要",
        "学文档", "画架构草图", "等 AI 批处理", "写周报", "过测试报告", "调接口联调",
    ];
    let mut rng = Lcg(20260919);
    for off in (-126..=-8).rev() {
        if rng.below(7) > 4 {
            continue; // 每周约 5/7 概率有记录
        }
        let day = day_str(off);
        let n = 1 + rng.below(3); // 1–3 个进程
        for k in 0..n {
            let title = TITLES[rng.below(TITLES.len() as u64) as usize];
            let color = if rng.below(10) < 3 { None } else { Some(rng.below(7) as i64) };
            let start_h = 9 + (rng.below(8) as u32);
            let created = at(off, start_h, (rng.below(60) as u32));
            let pid = ops::process_create(conn, created, title, color, Some(&day)).unwrap();
            let work_min = 25 + rng.below(120) as i64;
            ops::process_switch(conn, created + 60_000, pid, None).unwrap();
            if rng.below(10) < 4 {
                ops::slice_complete(conn, created + 60_000 + 25 * 60_000, pid).unwrap();
            }
            ops::process_complete(conn, created + 60_000 + work_min * 60_000, pid).unwrap();
            let _ = k;
        }
    }
}

fn main() {
    let deep = std::env::args().any(|a| a == "--deep");
    let path = std::env::var("GIKA_DB_PATH").unwrap_or_else(|_| "./gika-seed.db".to_string());
    if std::path::Path::new(&path).exists() {
        std::fs::remove_file(&path).expect("删除旧种子库失败（可能被 tauri dev 占用）");
    }
    let conn = db::open(std::path::Path::new(&path)).expect("打开种子库失败");

    // ============ 过去六天 ============
    work_day(
        &conn,
        -6,
        &[
            ("写季度方案初稿", Some(0), 9, 30, 11, 40),
            ("读 RAG 综述论文", Some(4), 13, 10, 15, 30),
            ("回一周积压邮件", None, 15, 50, 16, 50),
        ],
        true,
    );
    work_day(
        &conn,
        -5,
        &[
            ("修订季度方案二稿", Some(0), 9, 25, 12, 0),
            ("调试支付回调超时", Some(3), 13, 20, 16, 10),
            ("读《形式的起源》第 1 章", Some(6), 16, 30, 17, 20),
        ],
        false,
    );
    work_day(
        &conn,
        -4,
        &[
            ("季度方案终稿", Some(0), 9, 20, 11, 50),
            ("评审两个 PR", Some(2), 13, 15, 15, 0),
            ("过一遍 Tauri 文档", Some(4), 15, 30, 17, 10),
        ],
        true,
    );

    // 第 -3 天：一个进程留挂起（跨天未完成的日常）
    let d3 = day_str(-3);
    let a = ops::process_create(&conn, at(-3, 9, 25), "写技术方案 RFC", Some(3), Some(&d3)).unwrap();
    let b = ops::process_create(&conn, at(-3, 13, 10), "修导出乱码 bug", Some(1), Some(&d3)).unwrap();
    let c3 = ops::process_create(&conn, at(-3, 16, 0), "读第二篇论文：检索评估", Some(4), Some(&d3)).unwrap();
    ops::process_switch(&conn, at(-3, 9, 26), a, None).unwrap();
    ops::slice_complete(&conn, at(-3, 10, 11), a).unwrap();
    rest_cycle(&conn, -3, 10 * 60 + 11, a, 15);
    ops::process_switch(&conn, at(-3, 13, 12), b, Some("RFC 写到威胁模型")).unwrap();
    lunch_idle(&conn, -3, b);
    ops::process_complete(&conn, at(-3, 15, 40), b).unwrap();
    ops::process_switch(&conn, at(-3, 15, 45), a, None).unwrap();
    ops::process_complete(&conn, at(-3, 17, 30), a).unwrap();
    ops::process_switch(&conn, at(-3, 17, 32), c3, None).unwrap();
    ops::breakpoint_set(&conn, at(-3, 17, 58), c3, "读了一半，明天继续").unwrap();
    ops::process_complete(&conn, at(-3, 17, 59), c3).unwrap();

    work_day(
        &conn,
        -2,
        &[
            ("准备方案评审会", Some(1), 9, 40, 11, 20),
            ("按评审意见改方案", Some(0), 13, 30, 16, 0),
            ("回邮件与约会议", None, 16, 20, 17, 0),
        ],
        true,
    );

    // 昨天
    let d1 = day_str(-1);
    let p1 = ops::process_create(&conn, at(-1, 9, 20), "写周报草稿", Some(1), Some(&d1)).unwrap();
    let p2 = ops::process_create(&conn, at(-1, 10, 0), "整理会议纪要模板", None, Some(&d1)).unwrap();
    let p3 = ops::process_create(&conn, at(-1, 13, 40), "读《形式的起源》第 3 章", Some(6), Some(&d1)).unwrap();
    ops::process_switch(&conn, at(-1, 9, 22), p1, None).unwrap();
    ops::slice_complete(&conn, at(-1, 10, 7), p1).unwrap();
    rest_cycle(&conn, -1, 10 * 60 + 7, p1, 14);
    ops::slice_aborted(&conn, at(-1, 10, 40), p1, 18 * 60_000).unwrap();
    ops::process_switch(&conn, at(-1, 10, 40), p2, Some("周报写到这周交付清单")).unwrap();
    ops::process_complete(&conn, at(-1, 11, 30), p2).unwrap();
    lunch_idle(&conn, -1, p2);
    ops::process_switch(&conn, at(-1, 13, 5), p1, None).unwrap();
    ops::process_complete(&conn, at(-1, 14, 10), p1).unwrap();
    ops::process_switch(&conn, at(-1, 14, 20), p3, None).unwrap();
    ops::slice_complete(&conn, at(-1, 15, 5), p3).unwrap();
    ops::process_complete(&conn, at(-1, 16, 0), p3).unwrap();

    // 稿库（跨昨天/今天/明天/后天）
    let y = day_str(-1);
    let t = day_str(0);
    let tm = day_str(1);
    let dat = day_str(2);
    let pl = ops::plan_create(&conn, at(-1, 9, 10), "整理会议纪要模板", Some(30), Some(&y)).unwrap();
    ops::plan_done(&conn, at(-1, 11, 30), pl).unwrap();

    // ============ 今天 ============
    let d0 = day_str(0);

    let morning = ops::process_create(&conn, at(0, 8, 55), "晨间规划：排今天的版面", None, Some(&d0)).unwrap();
    let review = ops::process_create(&conn, at(0, 9, 30), "审 PR #142：断点续传", Some(2), Some(&d0)).unwrap();
    let mails = ops::process_create(&conn, at(0, 10, 5), "回三封邮件", Some(5), Some(&d0)).unwrap();
    let kernel = ops::process_create(&conn, at(0, 10, 22), "改 gika 数据内核", Some(3), Some(&d0)).unwrap();

    ops::process_switch(&conn, at(0, 9, 0), morning, None).unwrap();
    ops::process_complete(&conn, at(0, 9, 28), morning).unwrap();

    let s1 = ops::step_add(&conn, at(0, 9, 30), review, "通读 diff").unwrap();
    let s2 = ops::step_add(&conn, at(0, 9, 30) + 1_000, review, "本地跑一遍").unwrap();
    let s3 = ops::step_add(&conn, at(0, 9, 30) + 2_000, review, "写评审意见").unwrap();
    ops::process_switch(&conn, at(0, 9, 32), review, None).unwrap();
    ops::step_check(&conn, at(0, 9, 50), s1, true).unwrap();
    ops::step_check(&conn, at(0, 10, 10), s2, true).unwrap();
    ops::step_check(&conn, at(0, 10, 18), s3, true).unwrap();
    ops::process_complete(&conn, at(0, 10, 20), review).unwrap();

    let k1 = ops::step_add(&conn, at(0, 10, 22), kernel, "定 schema v1").unwrap();
    let k2 = ops::step_add(&conn, at(0, 10, 22) + 1_000, kernel, "状态机与命令层").unwrap();
    ops::step_add(&conn, at(0, 10, 22) + 2_000, kernel, "集成测试三件套").unwrap();
    ops::step_add(&conn, at(0, 10, 22) + 3_000, kernel, "一周种子数据").unwrap();
    ops::process_switch(&conn, at(0, 10, 25), kernel, None).unwrap();
    ops::slice_complete(&conn, at(0, 11, 10), kernel).unwrap();
    rest_cycle(&conn, 0, 11 * 60 + 10, kernel, 15);
    ops::step_check(&conn, at(0, 11, 25), k1, true).unwrap();
    ops::slice_complete(&conn, at(0, 12, 10), kernel).unwrap();
    ops::idle_start(&conn, at(0, 12, 12), Some(kernel)).unwrap();
    ops::idle_end(&conn, at(0, 13, 5), Some(kernel)).unwrap();
    ops::step_check(&conn, at(0, 13, 40), k2, true).unwrap();
    ops::slice_complete(&conn, at(0, 13, 50), kernel).unwrap();
    ops::rest_trigger(&conn, at(0, 13, 50), Some(kernel), "ring_full", 45 * 60_000).unwrap();
    ops::rest_choice(&conn, at(0, 13, 50) + 2_000, Some(kernel), "defer").unwrap();

    // 提前切走（时间片未完成）
    ops::slice_aborted(&conn, at(0, 14, 0), kernel, 10 * 60_000).unwrap();
    ops::process_switch(&conn, at(0, 14, 0), mails, Some("waiting_ai 还原还差测试")).unwrap();
    ops::slice_aborted(&conn, at(0, 14, 20), mails, 20 * 60_000).unwrap();
    ops::process_switch(&conn, at(0, 14, 20), kernel, Some("已回两封，剩财务那封")).unwrap();
    ops::slice_complete(&conn, at(0, 15, 5), kernel).unwrap();
    rest_cycle(&conn, 0, 15 * 60 + 5, kernel, 15);
    // kernel 仍在运行（开口段自 15:20 起）

    // 挂起队列新成员（老化时长各不相同）
    let weekly = ops::process_create(&conn, at(0, 15, 35), "写周报", Some(0), Some(&d0)).unwrap();
    let book = ops::process_create(&conn, at(0, 16, 10), "读《形式的起源》第 4 章", Some(6), Some(&d0)).unwrap();
    let waiting = ops::process_create(&conn, at(0, 16, 40), "等 AI 跑财报数据", Some(1), Some(&d0)).unwrap();
    let _ = (weekly, book);
    ops::waiting_ai_set(&conn, at(0, 16, 45), waiting, true).unwrap();

    // 今天的稿库
    ops::plan_create(&conn, at(0, 9, 5), "准备周五评审材料", Some(60), Some(&t)).unwrap();
    ops::plan_create(&conn, at(0, 9, 6), "给设计稿写反馈", Some(25), Some(&t)).unwrap();
    ops::plan_create(&conn, at(0, 9, 7), "订下周差旅", Some(15), Some(&t)).unwrap();
    ops::plan_create(&conn, at(0, 17, 0), "约一对一谈晋升节奏", Some(30), Some(&tm)).unwrap();
    ops::plan_create(&conn, at(0, 17, 1), "读完 RAG 综述第 3 节", Some(40), Some(&tm)).unwrap();
    ops::plan_create(&conn, at(0, 17, 2), "整理季度 OKR 草稿", Some(45), Some(&dat)).unwrap();

    if deep {
        seed_deep(&conn);
        println!("--deep: 过去 120 天稀疏数据已铺");
    }
    // 汇总输出
    let p: i64 = conn.query_row("SELECT COUNT(*) FROM processes", [], |r| r.get(0)).unwrap();
    let pl: i64 = conn.query_row("SELECT COUNT(*) FROM plans", [], |r| r.get(0)).unwrap();
    let st: i64 = conn.query_row("SELECT COUNT(*) FROM steps", [], |r| r.get(0)).unwrap();
    let sg: i64 = conn.query_row("SELECT COUNT(*) FROM segments", [], |r| r.get(0)).unwrap();
    let ev: i64 = conn.query_row("SELECT COUNT(*) FROM events", [], |r| r.get(0)).unwrap();
    println!("种子完成: {path}");
    println!("processes={p} plans={pl} steps={st} segments={sg} events={ev}");
    println!("今天 = {d0}");
}
