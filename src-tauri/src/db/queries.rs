//! 查询：M0 验收四问 + 版面/事件/设置/色标。

use super::{day_range, now_ms, row_to_process, row_to_step, Event, PaletteEntry, Plan, Process, Step};
use rusqlite::Connection;
use serde::Serialize;

#[derive(Serialize)]
pub struct BoardProcess {
    pub process: Process,
    pub steps: Vec<Step>,
}

#[derive(Serialize)]
pub struct BoardDay {
    pub day: String,
    pub running: Option<BoardProcess>,
    pub suspended: Vec<BoardProcess>, // 含 waiting_ai，按 queue_position
    pub completed: Vec<BoardProcess>, // 按 completed_at
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

fn board_process(conn: &Connection, p: Process) -> Result<BoardProcess, String> {
    Ok(BoardProcess {
        steps: steps_of(conn, p.id)?,
        process: p,
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

    Ok(BoardDay {
        day: day.to_string(),
        running: running.map(|p| board_process(conn, p)).transpose()?,
        suspended: suspended
            .into_iter()
            .map(|p| board_process(conn, p))
            .collect::<Result<Vec<_>, _>>()?,
        completed: completed
            .into_iter()
            .map(|p| board_process(conn, p))
            .collect::<Result<Vec<_>, _>>()?,
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

/// 挂起时长（ms，老化口径）：当天处于 suspended 且非 waiting_ai 的时长，从事件流重建。
pub fn q_suspended_ms(conn: &Connection, pid: i64, day: &str) -> Result<i64, String> {
    q_suspended_ms_at(conn, pid, day, now_ms())
}

pub fn q_suspended_ms_at(conn: &Connection, pid: i64, day: &str, as_of: i64) -> Result<i64, String> {
    let (start, end) = day_range(day)?;
    let now = as_of.min(end);
    let mut stmt = conn
        .prepare(
            "SELECT ts, kind, payload FROM events
             WHERE process_id = ?1 AND ts < ?2
               AND kind IN ('process_create','switch_in','switch_out','waiting_ai_set','process_complete','process_reopen')
             ORDER BY id",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(i64, String, Option<String>)> = stmt
        .query_map(rusqlite::params![pid, end], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // 初始状态：第一条事件之前不存在
    let mut suspended_since: Option<i64> = None;
    let mut waiting_ai = false;
    let mut total = 0i64;

    let enter = |since: &mut Option<i64>, ts: i64| {
        *since = Some(ts);
    };

    for (ts, kind, payload) in &rows {
        let ts = *ts;
        let close_interval = |since: &mut Option<i64>, until: i64, total: &mut i64| {
            if let Some(s) = since.take() {
                let a = s.max(start);
                let b = until.min(now);
                if b > a {
                    *total += b - a;
                }
            }
        };
        match kind.as_str() {
            "process_create" | "switch_out" | "process_reopen" => {
                waiting_ai = false;
                enter(&mut suspended_since, ts);
            }
            "waiting_ai_set" => {
                let on: bool = payload
                    .as_deref()
                    .and_then(|p| serde_json::from_str::<serde_json::Value>(p).ok())
                    .and_then(|v| v.get("on").and_then(|b| b.as_bool()))
                    .unwrap_or(false);
                if on {
                    // 等AI 不参与老化：挂起区间在此截断
                    close_interval(&mut suspended_since, ts, &mut total);
                    waiting_ai = true;
                } else {
                    waiting_ai = false;
                    // 还原到 suspended 才继续计老化
                    let restored = payload
                        .as_deref()
                        .and_then(|p| serde_json::from_str::<serde_json::Value>(p).ok())
                        .and_then(|v| {
                            v.get("restored").and_then(|s| s.as_str()).map(String::from)
                        })
                        .unwrap_or_else(|| "suspended".into());
                    if restored == "suspended" {
                        enter(&mut suspended_since, ts);
                    }
                }
            }
            "switch_in" | "process_complete" => {
                close_interval(&mut suspended_since, ts, &mut total);
                waiting_ai = false;
            }
            _ => {}
        }
    }
    // 尾部开口区间（仍挂起中）
    if let Some(s) = suspended_since {
        if !waiting_ai {
            let a = s.max(start);
            if now > a {
                total += now - a;
            }
        }
    }
    Ok(total)
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
