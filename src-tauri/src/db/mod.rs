//! 数据内核：连接管理、迁移、行类型、本地时间工具。
//! 事实源是 append-only 的 events 表；其余表是物化状态。

pub mod ops;
pub mod queries;

use chrono::{Datelike, Local, TimeZone};
use rusqlite::Connection;
use serde::Serialize;
use std::sync::Mutex;

/// tauri state：单连接互斥（SQLite 写串行化足够）
pub struct DbState(pub Mutex<Connection>);

pub const MIGRATION_V1: &str = r#"
CREATE TABLE processes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'suspended',   -- suspended / running / waiting_ai / completed
  prev_state TEXT,                            -- waiting_ai 之前的原状态，用于还原
  color_tag INTEGER,                          -- NULL 或 0..6（色标槽位）
  breakpoint TEXT,                            -- 断点：切走时留下的"做到哪了"
  created_at INTEGER NOT NULL,
  activated_count INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  queue_position INTEGER,                     -- 挂起队列序；completed 后为 NULL
  board_date TEXT NOT NULL,                   -- 排入版面的日期 YYYY-MM-DD
  notes TEXT                                  -- 个人记录（详情栏沉底自由文本）
);

CREATE TABLE plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  est_minutes INTEGER,
  scheduled_date TEXT,                        -- 预定日 YYYY-MM-DD
  state TEXT NOT NULL DEFAULT 'pool',         -- pool / completed / deleted
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  position INTEGER
);

CREATE TABLE steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_id INTEGER NOT NULL REFERENCES processes(id),
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  done_at INTEGER,
  position INTEGER NOT NULL
);

CREATE TABLE segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  process_id INTEGER NOT NULL REFERENCES processes(id),
  started_at INTEGER NOT NULL,
  ended_at INTEGER,                           -- NULL = 计时开口
  day TEXT NOT NULL,                          -- started_at 的本地日
  kind TEXT NOT NULL DEFAULT 'focus',
  note TEXT
);
CREATE INDEX idx_segments_pid_day ON segments(process_id, day);

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,                        -- epoch ms
  kind TEXT NOT NULL,
  process_id INTEGER,
  payload TEXT                                -- JSON
);
CREATE INDEX idx_events_ts ON events(ts);
CREATE INDEX idx_events_pid_ts ON events(process_id, ts);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE palette (
  theme TEXT NOT NULL,                        -- light / dark
  slot INTEGER NOT NULL,                      -- 0..6
  hex TEXT NOT NULL,
  PRIMARY KEY (theme, slot)
);
"#;

const SETTINGS_SEED: &[(&str, &str)] = &[
    ("slice_minutes", "45"),
    ("continuous_limit_minutes", "90"),
    ("idle_threshold_minutes", "5"),
    ("rest_mode", "soft"),
    ("hotkey", "Alt+Q"),
    ("always_on_top", "0"),
    ("theme", "light"),
];

// M1 视觉定稿色（2026-09-19）：暖调家族，dark 提明度保饱和
const PALETTE_LIGHT: &[&str] = &[
    "#D0493B", "#D97E33", "#BE9229", "#5F8A3C", "#3D7D67", "#486E8D", "#97516B",
];
const PALETTE_DARK: &[&str] = &[
    "#E47A6F", "#E59A5A", "#D3AE57", "#8AAC63", "#66A78F", "#7595B2", "#BB82A0",
];

pub fn now_ms() -> i64 {
    Local::now().timestamp_millis()
}

/// epoch ms → 本地日 YYYY-MM-DD
pub fn day_of(ts_ms: i64) -> String {
    let dt = Local.timestamp_millis_opt(ts_ms).unwrap();
    format!("{:04}-{:02}-{:02}", dt.year(), dt.month(), dt.day())
}

/// 本地日 → [起, 止) epoch ms
pub fn day_range(day: &str) -> Result<(i64, i64), String> {
    let (y, m, d) = parse_day(day)?;
    let start = Local
        .with_ymd_and_hms(y, m, d, 0, 0, 0)
        .single()
        .ok_or_else(|| format!("无效的本地日界: {day}"))?;
    let end = start + chrono::Duration::days(1);
    Ok((start.timestamp_millis(), end.timestamp_millis()))
}

pub fn today_local() -> String {
    day_of(now_ms())
}

fn parse_day(day: &str) -> Result<(i32, u32, u32), String> {
    let parts: Vec<&str> = day.split('-').collect();
    if parts.len() != 3 {
        return Err(format!("日期格式应为 YYYY-MM-DD: {day}"));
    }
    let y = parts[0].parse().map_err(|_| format!("无效年份: {day}"))?;
    let m = parts[1].parse().map_err(|_| format!("无效月份: {day}"))?;
    let d = parts[2].parse().map_err(|_| format!("无效日: {day}"))?;
    Ok((y, m, d))
}

pub fn open(path: &std::path::Path) -> Result<Connection, String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    init(conn)
}

pub fn open_in_memory() -> Result<Connection, String> {
    init(Connection::open_in_memory().map_err(|e| e.to_string())?)
}

fn init(conn: Connection) -> Result<Connection, String> {
    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           version INTEGER PRIMARY KEY,
           applied_at INTEGER NOT NULL
         );",
    )
    .map_err(|e| e.to_string())?;

    let applied: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    if applied < 1 {
        conn.execute_batch(MIGRATION_V1)
            .map_err(|e| format!("迁移 v1 失败: {e}"))?;
        for (k, v) in SETTINGS_SEED {
            conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
                rusqlite::params![k, v],
            )
            .map_err(|e| e.to_string())?;
        }
        seed_palette(conn, PALETTE_LIGHT, "light")?;
        seed_palette(conn, PALETTE_DARK, "dark")?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?1)",
            rusqlite::params![now_ms()],
        )
        .map_err(|e| e.to_string())?;
    }

    // v2：palette 定稿色（M1 视觉定稿）+ processes.notes（详情栏个人记录）
    if applied < 2 {
        seed_palette(conn, PALETTE_LIGHT, "light")?;
        seed_palette(conn, PALETTE_DARK, "dark")?;
        let has_notes = {
            let mut stmt = conn.prepare("PRAGMA table_info(processes)").map_err(|e| e.to_string())?;
            let names = stmt
                .query_map([], |r| r.get::<_, String>(1))
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect::<Vec<_>>();
            names.iter().any(|n| n == "notes")
        };
        if !has_notes {
            conn.execute_batch("ALTER TABLE processes ADD COLUMN notes TEXT;")
                .map_err(|e| format!("迁移 v2 失败: {e}"))?;
        }
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?1)",
            rusqlite::params![now_ms()],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn seed_palette(conn: &Connection, hexes: &[&str], theme: &str) -> Result<(), String> {
    for (slot, hex) in hexes.iter().enumerate() {
        conn.execute(
            "INSERT INTO palette (theme, slot, hex) VALUES (?1, ?2, ?3)
             ON CONFLICT(theme, slot) DO UPDATE SET hex = excluded.hex",
            rusqlite::params![theme, slot as i64, hex],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------- 行类型 ----------

#[derive(Serialize, Clone, Debug)]
pub struct Process {
    pub id: i64,
    pub title: String,
    pub state: String,
    pub prev_state: Option<String>,
    pub color_tag: Option<i64>,
    pub breakpoint: Option<String>,
    pub created_at: i64,
    pub activated_count: i64,
    pub completed_at: Option<i64>,
    pub queue_position: Option<i64>,
    pub board_date: String,
    pub notes: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Step {
    pub id: i64,
    pub process_id: i64,
    pub title: String,
    pub done: bool,
    pub done_at: Option<i64>,
    pub position: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct Plan {
    pub id: i64,
    pub title: String,
    pub est_minutes: Option<i64>,
    pub scheduled_date: Option<String>,
    pub state: String,
    pub created_at: i64,
    pub completed_at: Option<i64>,
    pub position: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Segment {
    pub id: i64,
    pub process_id: i64,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub day: String,
    pub kind: String,
    pub note: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Event {
    pub id: i64,
    pub ts: i64,
    pub kind: String,
    pub process_id: Option<i64>,
    pub payload: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct PaletteEntry {
    pub theme: String,
    pub slot: i64,
    pub hex: String,
}

pub fn row_to_process(r: &rusqlite::Row) -> rusqlite::Result<Process> {
    Ok(Process {
        id: r.get("id")?,
        title: r.get("title")?,
        state: r.get("state")?,
        prev_state: r.get("prev_state")?,
        color_tag: r.get("color_tag")?,
        breakpoint: r.get("breakpoint")?,
        created_at: r.get("created_at")?,
        activated_count: r.get("activated_count")?,
        completed_at: r.get("completed_at")?,
        queue_position: r.get("queue_position")?,
        board_date: r.get("board_date")?,
        notes: r.get("notes").ok(),
    })
}

pub fn row_to_step(r: &rusqlite::Row) -> rusqlite::Result<Step> {
    Ok(Step {
        id: r.get("id")?,
        process_id: r.get("process_id")?,
        title: r.get("title")?,
        done: r.get::<_, i64>("done")? != 0,
        done_at: r.get("done_at")?,
        position: r.get("position")?,
    })
}

pub fn get_process(conn: &Connection, id: i64) -> Result<Process, String> {
    conn.query_row(
        "SELECT * FROM processes WHERE id = ?1",
        rusqlite::params![id],
        row_to_process,
    )
    .map_err(|e| format!("进程 {id} 不存在: {e}"))
}

/// 追加事件（唯一事实源；全代码库禁止 UPDATE/DELETE events）
pub fn append_event(
    conn: &Connection,
    ts: i64,
    kind: &str,
    process_id: Option<i64>,
    payload: serde_json::Value,
) -> Result<i64, String> {
    conn.execute(
        "INSERT INTO events (ts, kind, process_id, payload) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![ts, kind, process_id, payload.to_string()],
    )
    .map_err(|e| format!("写事件失败: {e}"))?;
    Ok(conn.last_insert_rowid())
}

/// 闭合进程的计时开口（switch_out / pause / idle_start / rest_start / complete 时调用）
pub fn close_open_segment(conn: &Connection, pid: i64, ts: i64) -> Result<bool, String> {
    let n = conn
        .execute(
            "UPDATE segments SET ended_at = ?2 WHERE process_id = ?1 AND ended_at IS NULL",
            rusqlite::params![pid, ts],
        )
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

/// 打开计时开口（若已有开口则不动，幂等）
pub fn open_segment(conn: &Connection, pid: i64, ts: i64) -> Result<(), String> {
    let open: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM segments WHERE process_id = ?1 AND ended_at IS NULL",
            rusqlite::params![pid],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    if open == 0 {
        conn.execute(
            "INSERT INTO segments (process_id, started_at, ended_at, day, kind) VALUES (?1, ?2, NULL, ?3, 'focus')",
            rusqlite::params![pid, ts, day_of(ts)],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 计时器当前是否开口：以 segments 事实为准（开口段存在=计时在走）。
/// 事件重放口径在 v1.2 守卫介入后会失真，废弃。
pub fn timer_open(conn: &Connection, pid: i64) -> Result<bool, String> {
    let open: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM segments WHERE process_id = ?1 AND ended_at IS NULL",
            rusqlite::params![pid],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(open > 0)
}

/// 计时最近一次是谁停/开的（pause/idle_start/rest_start/resume/idle_end/rest_end/switch_in）
pub fn last_timer_closer(conn: &Connection, pid: i64) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT kind FROM events
             WHERE process_id = ?1
               AND kind IN ('pause','idle_start','rest_start','resume','idle_end','rest_end','switch_in')
             ORDER BY id DESC LIMIT 1",
        )
        .map_err(|e| e.to_string())?;
    Ok(stmt.query_row(rusqlite::params![pid], |r| r.get(0)).ok())
}
