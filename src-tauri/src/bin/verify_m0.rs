//! M0 验收：对种子库执行"四问"查询并打印结果。
//! 用法：GIKA_DB_PATH=可选 pnpm verify:m0

use gika_lib::db::{self, queries};

fn fmt_ms(ms: i64) -> String {
    let min = ms / 60_000;
    format!("{}h {}m", min / 60, min % 60)
}

fn main() {
    let path = std::env::var("GIKA_DB_PATH").unwrap_or_else(|_| "./gika-seed.db".to_string());
    let conn = db::open(std::path::Path::new(&path)).expect("打开库失败");
    let today = db::today_local();
    // 种子按固定钟点写入；as-of 可由 GIKA_AS_OF(epoch ms) 注入，默认真实 now
    let as_of: i64 = std::env::var("GIKA_AS_OF")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(db::now_ms);
    println!("库: {path}  今天 = {today}  as-of = {as_of}\n");

    let board = queries::q_board(&conn, &today).expect("q_board 失败");
    println!("== q_board({today}) ==");
    if let Some(r) = &board.running {
        println!(
            "  运行中: #{} {}（步骤 {} 个）",
            r.process.id,
            r.process.title,
            r.steps.len()
        );
    }
    for bp in &board.suspended {
        println!(
            "  挂起: #{} {}{}{}",
            bp.process.id,
            bp.process.title,
            if bp.process.state == "waiting_ai" { " [等AI]" } else { "" },
            bp.process
                .breakpoint
                .as_deref()
                .map(|b| format!("（断点：{b}）"))
                .unwrap_or_default(),
        );
    }
    for bp in &board.completed {
        println!("  已完: #{} {}", bp.process.id, bp.process.title);
    }
    println!();

    // 四问之一：运行中进程当天累计用时
    let running = board.running.as_ref().expect("今天应有运行中进程");
    let total = queries::q_process_day_total_at(&conn, running.process.id, &today, as_of).unwrap();
    println!(
        "Q1 「#{} {}」当天累计用时 = {}（{} ms）",
        running.process.id,
        running.process.title,
        fmt_ms(total),
        total
    );

    // 四问之二：挂起时长（找断点为"已回两封"的进程，挂起窗口 10:05→14:00 完整闭合）
    let mails = board
        .suspended
        .iter()
        .find(|bp| bp.process.title.contains("邮件"))
        .expect("今天应有邮件进程");
    let susp = queries::q_suspended_ms_at(&conn, mails.process.id, &today, as_of).unwrap();
    println!(
        "Q2 「#{} {}」当天挂起时长 = {}（{} ms，含当前开口区间）",
        mails.process.id,
        mails.process.title,
        fmt_ms(susp),
        susp
    );

    // 四问之三：时间片完成率（运行中进程）
    let stats = queries::q_slice_stats(&conn, running.process.id, &today).unwrap();
    let sum = stats.complete + stats.aborted;
    println!(
        "Q3 「#{} {}」时间片: 完成 {} / 提前切走 {}（完成率 {:.0}%）",
        running.process.id,
        running.process.title,
        stats.complete,
        stats.aborted,
        if sum > 0 { stats.complete as f64 / sum as f64 * 100.0 } else { 0.0 },
    );

    // 四问之四：当天连续无休息工作时长
    let cont = queries::q_continuous_work_ms_at(&conn, &today, as_of).unwrap();
    println!("Q4 当天连续工作时长 = {}（{} ms）", fmt_ms(cont), cont);

    let plans = queries::q_plans(&conn).unwrap();
    println!("\n== 稿库 ==");
    for p in plans {
        println!(
            "  · {}（预定日 {}，{}分钟）",
            p.title,
            p.scheduled_date.as_deref().unwrap_or("未定"),
            p.est_minutes.unwrap_or(0),
        );
    }
}
