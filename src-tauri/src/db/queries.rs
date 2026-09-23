//! 查询：M0 验收四问 + 版面/事件/设置/色标。

use super::{day_of, day_range, now_ms, row_to_process, row_to_step, get_process, Event, PaletteEntry, Plan, Process, Step};
use rusqlite::Connection;
use serde::Serialize;

#[derive(Serialize)]
pub struct BoardProcess {
    pub process: Process,
    pub steps: Vec<Step>,
    pub day_total_ms: i64,                    // 当天累计用时（开口段算到 now）
    pub aging_ms: Option<i64>,                // 挂起中：老化时长（不含等AI 区间）
    pub active_segment_started_at: Option<i64>, // 运行中：当前开口段起点
    pub timer_open: bool,                     // 计时器是否开口（暂停=闭）
    pub ring_elapsed_ms: i64,                 // 本次时间片已计时长（扣暂停/空闲/休息）
    pub stack_top: Option<StackTop>,          // 导语：栈顶条目（note 或未勾选 step）
}

#[derive(Serialize)]
pub struct BoardDay {
    pub day: String,
    pub running: Option<BoardProcess>,
    pub suspended: Vec<BoardProcess>, // 含 waiting_ai，按 queue_position
    pub completed: Vec<BoardProcess>, // 按 completed_at
    pub completed_total_ms: i64,      // 已完栏总时长
}

#[derive(Serialize, Clone)]
pub struct StackTop {
    pub title: String,
    pub kind: String, // step | note
}

#[derive(Serialize)]
pub struct SliceStats {
    pub complete: i64,
    pub aborted: i64,
}

fn steps_of(conn: &Connection, pid: i64) -> Result<Vec<Step>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM steps WHERE process_id = ?1 ORDER BY position, id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![pid], row_to_step)
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

fn open_segment_started_at(conn: &Connection, pid: i64) -> Result<Option<i64>, String> {
    let mut stmt = conn
        .prepare("SELECT started_at FROM segments WHERE process_id = ?1 AND ended_at IS NULL LIMIT 1")
        .map_err(|e| e.to_string())?;
    Ok(stmt.query_row(rusqlite::params![pid], |r| r.get(0)).ok())
}

/// 时间环已计时长：锚点 = 本会话最后一个 switch_in / slice_complete；
/// 之后 focus segments 的覆盖时长（segments 闭合天然扣除暂停/空闲/休息）。
fn ring_elapsed_ms(conn: &Connection, pid: i64, now: i64) -> Result<i64, String> {
    let anchor: Option<i64> = conn
        .query_row(
            "SELECT ts FROM events WHERE process_id = ?1 AND kind IN ('switch_in','slice_complete') ORDER BY id DESC LIMIT 1",
            rusqlite::params![pid],
            |r| r.get(0),
        )
        .ok();
    let anchor = match anchor {
        Some(a) => a,
        None => return Ok(0),
    };
    let mut stmt = conn
        .prepare("SELECT started_at, ended_at FROM segments WHERE process_id = ?1 AND kind = 'focus' AND COALESCE(ended_at, ?2) > ?3")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![pid, now, anchor], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, Option<i64>>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut total = 0i64;
    for r in rows.flatten() {
        let (s, e) = (r.0, r.1.unwrap_or(now));
        total += (e.min(now) - s.max(anchor)).max(0);
    }
    Ok(total)
}

fn board_process(conn: &Connection, day: &str, p: Process) -> Result<BoardProcess, String> {
    let steps = steps_of(conn, p.id)?;
    // 导语 = 栈顶条目：断点条（note）或未勾选的步骤（已勾选沉底语义之外原位保留但不算"做到哪"）
    let stack_top = steps
        .iter()
        .find(|s| s.kind == "note" || !s.done)
        .map(|s| StackTop { title: s.title.clone(), kind: s.kind.clone() });
    let day_total_ms = q_process_day_total(conn, p.id, day)?;
    let aging_ms = if matches!(p.state.as_str(), "suspended" | "waiting_ai") {
        Some(q_suspended_ms(conn, p.id, day)?)
    } else {
        None
    };
    let active_segment_started_at = open_segment_started_at(conn, p.id)?;
    let ring_elapsed = ring_elapsed_ms(conn, p.id, now_ms())?;
    Ok(BoardProcess {
        timer_open: p.state == "running" && active_segment_started_at.is_some(),
        active_segment_started_at,
        ring_elapsed_ms: ring_elapsed,
        stack_top,
        process: p,
        steps,
        day_total_ms,
        aging_ms,
    })
}

/// 当天版面：已完 / 活跃（running）/ 挂起队列（含等AI）
pub fn q_board(conn: &Connection, day: &str) -> Result<BoardDay, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM processes WHERE board_date = ?1")
        .map_err(|e| e.to_string())?;
    let rows: Vec<Process> = stmt
        .query_map(rusqlite::params![day], row_to_process)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut running = None;
    let mut suspended: Vec<Process> = vec![];
    let mut completed: Vec<Process> = vec![];
    for p in rows {
        match p.state.as_str() {
            "running" => running = Some(p),
            "completed" => completed.push(p),
            _ => suspended.push(p),
        }
    }
    suspended.sort_by_key(|p| p.queue_position.unwrap_or(i64::MAX));
    completed.sort_by_key(|p| p.completed_at.unwrap_or(0));

    let completed_total_ms = completed
        .iter()
        .map(|p| q_process_day_total(conn, p.id, day))
        .collect::<Result<Vec<i64>, _>>()?
        .into_iter()
        .sum();

    Ok(BoardDay {
        day: day.to_string(),
        running: running.map(|p| board_process(conn, day, p)).transpose()?,
        suspended: suspended
            .into_iter()
            .map(|p| board_process(conn, day, p))
            .collect::<Result<Vec<_>, _>>()?,
        completed: completed
            .into_iter()
            .map(|p| board_process(conn, day, p))
            .collect::<Result<Vec<_>, _>>()?,
        completed_total_ms,
    })
}

/// 进程当天累计用时（ms）：focus segments 求和，开口段算到 now
pub fn q_process_day_total(conn: &Connection, pid: i64, day: &str) -> Result<i64, String> {
    q_process_day_total_at(conn, pid, day, now_ms())
}

/// as-of 变体：测试与验收可注入"现在"
pub fn q_process_day_total_at(conn: &Connection, pid: i64, day: &str, now: i64) -> Result<i64, String> {
    let mut stmt = conn
        .prepare("SELECT started_at, ended_at FROM segments WHERE process_id = ?1 AND day = ?2 AND kind = 'focus'")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![pid, day], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, Option<i64>>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut total = 0i64;
    for r in rows.flatten() {
        total += (r.1.unwrap_or(now) - r.0).max(0);
    }
    Ok(total.max(0))
}

/// 老化（ms，2026-09-22 改口径）：**当前这段挂起**——距上一次挂上（process_create /
/// switch_out / process_reopen）至今；捞回（switch_in / complete）即清零重计。
/// 等AI 是挂起子状态，时段照算（它只是不参与呈现：不褪色、标签不加深）。
pub fn q_suspended_ms(conn: &Connection, pid: i64, day: &str) -> Result<i64, String> {
    q_suspended_ms_at(conn, pid, day, now_ms())
}

pub fn q_suspended_ms_at(conn: &Connection, pid: i64, day: &str, as_of: i64) -> Result<i64, String> {
    let (start, end) = day_range(day)?;
    let now = as_of.min(end);
    let mut stmt = conn
        .prepare(
            "SELECT ts, kind FROM events
             WHERE process_id = ?1 AND ts < ?2
               AND kind IN ('process_create','switch_in','switch_out','process_complete','process_reopen')
             ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map(rusqlite::params![pid, end], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 当前段起点：最后一次"挂上"；捞回即清零
    let mut since: Option<i64> = None;
    for (ts, kind) in &rows {
        match kind.as_str() {
            "process_create" | "switch_out" | "process_reopen" => since = Some(*ts),
            "switch_in" | "process_complete" => since = None,
            _ => {}
        }
    }
    Ok(match since {
        Some(s) => (now - s.max(start)).max(0),
        None => 0,
    })
}

/// 时间片统计：当天 slice_complete / slice_aborted 计数
pub fn q_slice_stats(conn: &Connection, pid: i64, day: &str) -> Result<SliceStats, String> {
    let (start, end) = day_range(day)?;
    let mut stmt = conn
        .prepare(
            "SELECT kind, COUNT(*) FROM events
             WHERE process_id = ?1 AND ts >= ?2 AND ts < ?3 AND kind IN ('slice_complete','slice_aborted')
             GROUP BY kind",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![pid, start, end], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?;
    let mut stats = SliceStats {
        complete: 0,
        aborted: 0,
    };
    for r in rows.flatten() {
        match r.0.as_str() {
            "slice_complete" => stats.complete = r.1,
            "slice_aborted" => stats.aborted = r.1,
            _ => {}
        }
    }
    Ok(stats)
}

/// 当天连续无休息工作时长（ms）：最后一个 rest_end / idle_start（含日界）之后的 focus 段总和；
/// 休息或空闲进行中返回 0。
pub fn q_continuous_work_ms(conn: &Connection, day: &str) -> Result<i64, String> {
    q_continuous_work_ms_at(conn, day, now_ms())
}

pub fn q_continuous_work_ms_at(conn: &Connection, day: &str, as_of: i64) -> Result<i64, String> {
    let (start, _) = day_range(day)?;
    let now = as_of;

    let mut stmt = conn
        .prepare(
            "SELECT ts, kind FROM events
             WHERE ts >= ?1 AND kind IN ('rest_start','rest_end','idle_start','idle_end')
             ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String)> = stmt
        .query_map(rusqlite::params![start], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut boundary = start;
    let mut resting = false;
    let mut idling = false;
    for (ts, kind) in &rows {
        match kind.as_str() {
            "rest_end" => {
                resting = false;
                boundary = boundary.max(*ts);
            }
            "idle_start" => {
                idling = true;
                boundary = boundary.max(*ts);
            }
            "rest_start" => resting = true,
            "idle_end" => idling = false,
            _ => {}
        }
    }
    if resting || idling {
        return Ok(0);
    }

    let mut stmt = conn
        .prepare("SELECT started_at, ended_at FROM segments WHERE kind = 'focus' AND ended_at IS NOT NULL AND started_at >= ?1")
        .map_err(|e| e.to_string())?;
    let closed: Vec<(i64, i64)> = stmt
        .query_map(rusqlite::params![boundary], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let mut total: i64 = closed.iter().map(|(a, b)| b - a).sum();

    // 开口段：当前正在运行的计时，从 max(started_at, boundary) 算到 now
    let mut stmt = conn
        .prepare("SELECT started_at FROM segments WHERE kind = 'focus' AND ended_at IS NULL")
        .map_err(|e| e.to_string())?;
    let opens: Vec<i64> = stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    for s in opens {
        if s >= start {
            total += (now - s.max(boundary)).max(0);
        }
    }
    Ok(total.max(0))
}

pub fn q_events(conn: &Connection, day: Option<&str>) -> Result<Vec<Event>, String> {
    let (sql, params): (String, Vec<i64>) = match day {
        Some(d) => {
            let (s, e) = day_range(d)?;
            (
                "SELECT * FROM events WHERE ts >= ?1 AND ts < ?2 ORDER BY id".to_string(),
                vec![s, e],
            )
        }
        None => ("SELECT * FROM events ORDER BY id".to_string(), vec![]),
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |r| {
            Ok(Event {
                id: r.get("id")?,
                ts: r.get("ts")?,
                kind: r.get("kind")?,
                process_id: r.get("process_id")?,
                payload: r.get("payload")?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn q_settings(conn: &Connection) -> Result<Vec<(String, String)>, String> {
    let mut stmt = conn
        .prepare("SELECT key, value FROM settings ORDER BY key")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn q_palette(conn: &Connection) -> Result<Vec<PaletteEntry>, String> {
    let mut stmt = conn
        .prepare("SELECT theme, slot, hex FROM palette ORDER BY theme, slot")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(PaletteEntry {
                theme: r.get("theme")?,
                slot: r.get("slot")?,
                hex: r.get("hex")?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

pub fn q_plans(conn: &Connection) -> Result<Vec<Plan>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM plans WHERE state = 'pool' ORDER BY COALESCE(scheduled_date, '9999'), position, id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Plan {
                id: r.get("id")?,
                title: r.get("title")?,
                est_minutes: r.get("est_minutes")?,
                scheduled_date: r.get("scheduled_date")?,
                state: r.get("state")?,
                created_at: r.get("created_at")?,
                completed_at: r.get("completed_at")?,
                position: r.get("position")?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// 进程当天的分段时长（详情栏用）
pub fn q_segments(conn: &Connection, pid: i64, day: &str) -> Result<Vec<super::Segment>, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM segments WHERE process_id = ?1 AND day = ?2 ORDER BY started_at")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(rusqlite::params![pid, day], |r| {
            Ok(super::Segment {
                id: r.get("id")?,
                process_id: r.get("process_id")?,
                started_at: r.get("started_at")?,
                ended_at: r.get("ended_at")?,
                day: r.get("day")?,
                kind: r.get("kind")?,
                note: r.get("note")?,
            })
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

#[derive(Serialize)]
pub struct ProcessDetail {
    pub process: Process,
    pub steps: Vec<Step>,
    pub stack_top: Option<StackTop>,
    pub segments: Vec<super::Segment>, // 所查看那一天的分段
    pub day_total_ms: i64,
}

/// 进程详情（统计页玻璃卡，2026-09-22）：按 pid 直查，不绑定当天版面
pub fn q_process_detail(conn: &Connection, pid: i64, day: &str) -> Result<ProcessDetail, String> {
    let p: Process = conn
        .query_row(
            "SELECT * FROM processes WHERE id = ?1",
            rusqlite::params![pid],
            row_to_process,
        )
        .map_err(|e| e.to_string())?;
    let steps = steps_of(conn, pid)?;
    let stack_top = steps
        .iter()
        .find(|s| s.kind == "note" || !s.done)
        .map(|s| StackTop { title: s.title.clone(), kind: s.kind.clone() });
    let segments = q_segments(conn, pid, day)?;
    let day_total_ms = q_process_day_total(conn, pid, day)?;
    Ok(ProcessDetail { process: p, steps, stack_top, segments, day_total_ms })
}

#[derive(Serialize)]
pub struct RestState {
    pub resting: bool,
    pub since: Option<i64>,
    pub source: Option<String>,   // ring_full / continuous
    pub reading_ms: Option<i64>,
    pub choice: Option<String>,   // 本次休息期内的最后一个 rest_choice（defer/rest/next/close）
}

/// 休息态：最后一个 rest_start 无对应 rest_end 即在休息中（双渲染的唯一事实源）
pub fn q_rest_state(conn: &Connection) -> Result<RestState, String> {
    let mut stmt = conn
        .prepare("SELECT ts, kind, payload FROM events WHERE kind IN ('rest_start','rest_end','rest_trigger','rest_choice') ORDER BY id")
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String, Option<String>)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut resting_since: Option<i64> = None;
    let mut last_trigger: Option<(String, Option<i64>)> = None;
    let mut choice: Option<String> = None;
    for (ts, kind, payload) in &rows {
        match kind.as_str() {
            "rest_start" => {
                resting_since = Some(*ts);
                choice = None;
            }
            "rest_end" => {
                resting_since = None;
                last_trigger = None;
                choice = None;
            }
            "rest_trigger" => {
                last_trigger = payload.as_deref().and_then(|p| {
                    serde_json::from_str::<serde_json::Value>(p).ok()
                }).map(|v| {
                    (
                        v.get("source").and_then(|s| s.as_str()).unwrap_or("").to_string(),
                        v.get("reading_ms").and_then(|n| n.as_i64()),
                    )
                });
            }
            "rest_choice" => {
                if resting_since.is_some() {
                    choice = payload.as_deref().and_then(|p| {
                        serde_json::from_str::<serde_json::Value>(p).ok()
                    }).and_then(|v| v.get("choice").and_then(|s| s.as_str()).map(String::from));
                }
            }
            _ => {}
        }
    }
    Ok(RestState {
        resting: resting_since.is_some(),
        since: resting_since,
        source: last_trigger.as_ref().map(|t| t.0.clone()),
        reading_ms: last_trigger.and_then(|t| t.1),
        choice,
    })
}

// ================= M3 · 统计页查询 =================

#[derive(Serialize)]
pub struct DaySlice {
    pub process_id: i64,
    pub title: String,
    pub color_tag: Option<i64>,
    pub ms: i64,
}

#[derive(Serialize)]
pub struct DayStats {
    pub day: String,
    pub slices: Vec<DaySlice>,
    pub total_ms: i64,
    pub switch_count: i64,
    pub longest_segment_ms: i64,
}

/// 当天每进程切片 + 总专注 + 切换次数 + 最长单段
pub fn q_day_stats(conn: &Connection, day: &str) -> Result<DayStats, String> {
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.title, p.color_tag,
                    SUM(MAX(COALESCE(s.ended_at, ?2) - s.started_at, 0)) AS ms,
                    MAX(MAX(COALESCE(s.ended_at, ?2) - s.started_at, 0)) AS longest
             FROM segments s JOIN processes p ON p.id = s.process_id
             WHERE s.day = ?1 AND s.kind = 'focus'
             GROUP BY p.id ORDER BY ms DESC",
        )
        .map_err(|e| e.to_string())?;
    let now = now_ms();
    let mut slices = vec![];
    let mut longest = 0i64;
    let mut total = 0i64;
    let rows = stmt
        .query_map(rusqlite::params![day, now], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<i64>>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    for r in rows.flatten() {
        total += r.3;
        longest = longest.max(r.4);
        slices.push(DaySlice {
            process_id: r.0,
            title: r.1,
            color_tag: r.2,
            ms: r.3,
        });
    }
    let (start, end) = day_range(day)?;
    let switch_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM events WHERE kind = 'switch_in' AND ts >= ?1 AND ts < ?2",
            rusqlite::params![start, end],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(DayStats {
        day: day.to_string(),
        slices,
        total_ms: total,
        switch_count,
        longest_segment_ms: longest,
    })
}

#[derive(Serialize)]
pub struct ShareByColor {
    pub color_tag: Option<i64>,
    pub ms: i64,
}

#[derive(Serialize)]
pub struct DayShares {
    pub day: String, // YYYY-MM-DD
    pub shares: Vec<ShareByColor>,
}

/// 月历：逐日色标聚合（只回有记录的日子）
pub fn q_month_calendar(conn: &Connection, year: i64, month: i64) -> Result<Vec<DayShares>, String> {
    let prefix = format!("{year:04}-{month:02}-");
    let mut stmt = conn
        .prepare(
            "SELECT s.day, p.color_tag, SUM(COALESCE(s.ended_at, ?2) - s.started_at)
             FROM segments s JOIN processes p ON p.id = s.process_id
             WHERE s.kind = 'focus' AND s.day LIKE ?1 || '%'
             GROUP BY s.day, p.color_tag ORDER BY s.day",
        )
        .map_err(|e| e.to_string())?;
    let now = now_ms();
    let rows = stmt
        .query_map(rusqlite::params![prefix, now], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<i64>>(1)?,
                r.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut by_day: Vec<(String, Vec<ShareByColor>)> = vec![];
    for r in rows.flatten() {
        if let Some(last) = by_day.last_mut() {
            if last.0 == r.0 {
                last.1.push(ShareByColor { color_tag: r.1, ms: r.2 });
                continue;
            }
        }
        by_day.push((r.0, vec![ShareByColor { color_tag: r.1, ms: r.2 }]));
    }
    Ok(by_day
        .into_iter()
        .map(|(day, shares)| DayShares { day, shares })
        .collect())
}

#[derive(Serialize)]
pub struct MonthShares {
    pub month: i64,
    pub shares: Vec<ShareByColor>,
}

#[derive(Serialize)]
pub struct YearOverview {
    pub year: i64,
    pub months: Vec<MonthShares>,
    pub available_years: Vec<i64>,
}

/// 年视图：逐月色标聚合 + 有记录的年份范围
pub fn q_year_overview(conn: &Connection, year: i64) -> Result<YearOverview, String> {
    let prefix = format!("{year:04}-");
    let mut stmt = conn
        .prepare(
            "SELECT substr(s.day, 6, 2) AS m, p.color_tag, SUM(COALESCE(s.ended_at, ?2) - s.started_at)
             FROM segments s JOIN processes p ON p.id = s.process_id
             WHERE s.kind = 'focus' AND s.day LIKE ?1 || '%'
             GROUP BY m, p.color_tag ORDER BY m",
        )
        .map_err(|e| e.to_string())?;
    let now = now_ms();
    let rows = stmt
        .query_map(rusqlite::params![prefix, now], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<i64>>(1)?,
                r.get::<_, i64>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut months: Vec<MonthShares> = vec![];
    for r in rows.flatten() {
        let m: i64 = r.0.parse().unwrap_or(0);
        if let Some(last) = months.last_mut() {
            if last.month == m {
                last.shares.push(ShareByColor { color_tag: r.1, ms: r.2 });
                continue;
            }
        }
        months.push(MonthShares {
            month: m,
            shares: vec![ShareByColor { color_tag: r.1, ms: r.2 }],
        });
    }
    let mut stmt = conn
        .prepare("SELECT DISTINCT substr(day, 1, 4) FROM segments ORDER BY 1")
        .map_err(|e| e.to_string())?;
    let years = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .filter_map(|y| y.parse::<i64>().ok())
        .collect();
    Ok(YearOverview {
        year,
        months,
        available_years: years,
    })
}

#[derive(Serialize)]
pub struct DayViewProcess {
    pub process_id: i64,
    pub title: String,
    pub color_tag: Option<i64>,
    pub ms: i64,
    pub steps_done: i64,
    pub steps_total: i64,
    pub breakpoint: Option<String>,
}

#[derive(Serialize)]
pub struct SuspendedCost {
    pub process_id: i64,
    pub title: String,
    pub waited_ms: i64,
    pub retrieved: bool, // false = 仍未捞回
}

#[derive(Serialize)]
pub struct DayView {
    pub day: String,
    pub done: Vec<DayViewProcess>,
    pub ongoing: Vec<DayViewProcess>,
    pub plans: Vec<Plan>,
    pub not_done: Vec<Plan>,
    pub suspended_costs: Vec<SuspendedCost>,
}

/// 当天视图：已做 / 进行中 / 未做 / 计划全量 / 挂起成本
pub fn q_day_view(conn: &Connection, day: &str) -> Result<DayView, String> {
    let mut stmt = conn
        .prepare("SELECT * FROM processes WHERE board_date = ?1")
        .map_err(|e| e.to_string())?;
    let procs: Vec<Process> = stmt
        .query_map(rusqlite::params![day], row_to_process)
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut done = vec![];
    let mut ongoing = vec![];
    for p in &procs {
        let steps = steps_of(conn, p.id)?;
        let top = steps.iter().find(|st| st.kind == "note" || !st.done).map(|st| st.title.clone());
        let ms = q_process_day_total(conn, p.id, day)?;
        let (done_n, total_n): (i64, i64) = conn
            .query_row(
                "SELECT COALESCE(SUM(done),0), COUNT(*) FROM steps WHERE process_id = ?1",
                rusqlite::params![p.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|e| e.to_string())?;
        let dvp = DayViewProcess {
            process_id: p.id,
            title: p.title.clone(),
            color_tag: p.color_tag,
            ms,
            steps_done: done_n,
            steps_total: total_n,
            breakpoint: top,
        };
        if p.state == "completed" {
            done.push(dvp);
        } else {
            ongoing.push(dvp);
        }
    }

    let mut stmt = conn
        .prepare("SELECT * FROM plans WHERE scheduled_date = ?1 AND state != 'deleted' ORDER BY position, id")
        .map_err(|e| e.to_string())?;
    let plans: Vec<Plan> = stmt
        .query_map(rusqlite::params![day], |r| {
            Ok(Plan {
                id: r.get("id")?,
                title: r.get("title")?,
                est_minutes: r.get("est_minutes")?,
                scheduled_date: r.get("scheduled_date")?,
                state: r.get("state")?,
                created_at: r.get("created_at")?,
                completed_at: r.get("completed_at")?,
                position: r.get("position")?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    let not_done = plans.iter().filter(|p| p.state == "pool").cloned().collect();

    // 挂起成本：每件进程首次进入挂起 → 首次 switch_in；未捞回 = 到日末/现在
    let (_, day_end) = day_range(day)?;
    let now = now_ms();
    let clip_end = if day == day_of(now) { now } else { day_end };
    let mut costs = vec![];
    for p in &procs {
        let mut stmt = conn
            .prepare(
                "SELECT ts, kind FROM events WHERE process_id = ?1
                 AND kind IN ('process_create','switch_in','switch_out') ORDER BY id",
            )
            .map_err(|e| e.to_string())?;
        let evs: Vec<(i64, String)> = stmt
            .query_map(rusqlite::params![p.id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        let mut suspend_at: Option<i64> = None;
        let mut waited: Option<i64> = None;
        for (ts, kind) in &evs {
            match kind.as_str() {
                "process_create" | "switch_out" => {
                    if suspend_at.is_none() {
                        suspend_at = Some(*ts);
                    }
                }
                "switch_in" => {
                    if let Some(s) = suspend_at.take() {
                        waited = Some(*ts - s);
                        break;
                    }
                }
                _ => {}
            }
        }
        if let Some(s) = suspend_at {
            costs.push(SuspendedCost {
                process_id: p.id,
                title: p.title.clone(),
                waited_ms: clip_end - s,
                retrieved: false,
            });
        } else if let Some(w) = waited {
            costs.push(SuspendedCost {
                process_id: p.id,
                title: p.title.clone(),
                waited_ms: w,
                retrieved: true,
            });
        }
    }

    Ok(DayView {
        day: day.to_string(),
        done,
        ongoing,
        plans,
        not_done,
        suspended_costs: costs,
    })
}

#[derive(Serialize)]
pub struct CellMark {
    pub process_id: i64,
    pub color_tag: Option<i64>,
    pub title: String,
    pub occ_start: i64, // 本时间格内的占用起点（钳制在格窗内）
    pub occ_end: i64,   // 占用止点（开口段钳到当下）
    pub share: f64,     // 占用率 0..1（分母=格的 10 分钟）
    pub is_start: bool, // 段起点落此格（半圆朝向右下）
    pub is_end: bool,   // 段止点落此格（半圆朝向左上）
}

#[derive(Serialize)]
pub struct GridOccupant {
    pub process_id: i64,
    pub color_tag: Option<i64>,
    pub title: String,
    pub occ_start: i64, // 格内钳制占用起点
    pub occ_end: i64,
    pub share: f64, // 占用率（不过滤，<20% 也列出——阈值只管画不画）
}

#[derive(Serialize)]
pub struct GridCell {
    pub cell: i64, // 0..107，列主序（i = col*6 + row，每格 10 分钟）
    pub marks: Vec<CellMark>, // 最多两枚：≥20% 的占用者取前二（对角分半）——只管画
    pub occupants: Vec<GridOccupant>, // 全部占用者按 ms 降序截前 4——悬停清单
    pub occupant_count: i64, // 该格占用者总数（>4 时前端收 "…等 N 项"）
}

/// 108 格日网格（v1.4：share=占用率，分母=格的 10 分钟；<20% 不返回、取前二）；
/// occ_start/occ_end 钳制在格窗内（与 mock 同口径）；一段进程沿阅读方向连续填充；时窗外不画
pub fn q_day_grid(conn: &Connection, day: &str) -> Result<Vec<GridCell>, String> {
    const CELL_MS: i64 = 600_000;
    const MIN_SHARE: f64 = 0.2; // 镜像 token --grid-min-share（渲染阈值仍走 token）
    let (day_start, _) = day_range(day)?;
    let win = day_start + 6 * 3_600_000; // 时窗起点 06:00
    let win_end = win + 18 * 3_600_000;
    let now = now_ms();
    let mut stmt = conn
        .prepare(
            "SELECT s.process_id, s.started_at, COALESCE(s.ended_at, ?2)
             FROM segments s WHERE s.day = ?1 AND s.kind = 'focus' ORDER BY s.started_at",
        )
        .map_err(|e| e.to_string())?;
    let segs = stmt
        .query_map(rusqlite::params![day, now], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, i64>(2)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect::<Vec<_>>();

    // cell -> pid -> 聚合（累计占用 / 占用区间并集）
    struct Acc {
        ms: i64,
        occ_s: i64,
        occ_e: i64,
    }
    let mut cells: Vec<std::collections::HashMap<i64, Acc>> = (0..108)
        .map(|_| std::collections::HashMap::new())
        .collect();

    for (pid, seg_s, seg_e) in &segs {
        // 截断到时窗内：06:00 前/24:00 后的部分不画；开口段钳到当下
        let gs = (*seg_s).max(win);
        let ge = (*seg_e).min(now).min(win_end);
        if ge <= gs {
            continue;
        }
        let c0 = ((gs - win) / CELL_MS).min(107) as usize;
        let c1 = ((ge - 1 - win) / CELL_MS).min(107) as usize;
        for c in c0..=c1 {
            let cell_s = win + c as i64 * CELL_MS;
            let s = gs.max(cell_s);
            let e = ge.min(cell_s + CELL_MS);
            if e <= s {
                continue;
            }
            let ov = e - s;
            let a = cells[c]
                .entry(*pid)
                .or_insert(Acc { ms: 0, occ_s: s, occ_e: e });
            a.ms += ov;
            a.occ_s = a.occ_s.min(s);
            a.occ_e = a.occ_e.max(e);
        }
    }

    let mut out = Vec::with_capacity(108);
    for (i, m) in cells.iter().enumerate() {
        let mut ranked: Vec<(&i64, &Acc)> = m.iter().collect();
        ranked.sort_by(|a, b| b.1.ms.cmp(&a.1.ms));
        // 悬停清单：全部占用者按 ms 降序截前 4（不过滤 share）
        let occupant_count = ranked.len() as i64;
        let mut occupants = Vec::new();
        for (pid, a) in ranked.iter().take(4) {
            let p = get_process(conn, **pid)?;
            occupants.push(GridOccupant {
                process_id: **pid,
                color_tag: p.color_tag,
                title: p.title,
                occ_start: a.occ_s,
                occ_end: a.occ_e,
                share: a.ms as f64 / CELL_MS as f64,
            });
        }
        // 画布标记：≥20% 取前二（对角分半）
        let mut marks = Vec::new();
        for (pid, a) in ranked.iter().take(2) {
            let share = a.ms as f64 / CELL_MS as f64;
            if share < MIN_SHARE {
                break; // 后面的更小，一并不取
            }
            let p = get_process(conn, **pid)?;
            // 朝向=相邻格有没有同进程占用（v1.4.2：前无=段起、后无=段止、前后都有=中段）——
            // 不按格内最长块判，被打断的格不再翻边
            let prev_has = i > 0 && cells[i - 1].contains_key(*pid);
            let next_has = i + 1 < 108 && cells[i + 1].contains_key(*pid);
            marks.push(CellMark {
                process_id: **pid,
                color_tag: p.color_tag,
                title: p.title,
                occ_start: a.occ_s,
                occ_end: a.occ_e,
                share,
                is_start: !prev_has,
                is_end: !next_has,
            });
        }
        out.push(GridCell {
            cell: i as i64,
            marks,
            occupants,
            occupant_count,
        });
    }
    Ok(out)
}

/// 最早有记录的日期（日视角滚动上界）
pub fn q_first_day(conn: &Connection) -> Result<Option<String>, String> {
    conn.query_row("SELECT MIN(day) FROM segments", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}
