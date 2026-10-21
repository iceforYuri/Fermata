//! tauri command 薄壳：锁 DbState → 调 db::ops/queries。全部 async（同步 command 派发到主线程会死锁）。
//! 变更命令成功后广播 "store-changed"，全部窗口监听重取（跨窗状态同步）。

use crate::db::{self, ops, queries, DbState, Event, PaletteEntry, Plan, Segment};
use queries::{BoardDay, RestState, SliceStats};
use std::sync::MutexGuard;
use tauri::{AppHandle, Emitter, Manager, State};

fn lock<'a, 'r: 'a>(
    state: &'a State<'r, DbState>,
) -> Result<MutexGuard<'a, rusqlite::Connection>, String> {
    state.inner().0.lock().map_err(|e| format!("DB 锁中毒: {e}"))
}

fn changed(app: &AppHandle) {
    let _ = app.emit("store-changed", ());
    sync_notify(app, false);
}

// ---------- 变更 ----------

#[tauri::command]
pub async fn process_create(
    app: AppHandle,
    state: State<'_, DbState>,
    title: String,
    color_tag: Option<i64>,
    board_date: Option<String>,
) -> Result<i64, String> {
    let c = lock(&state)?;
    let r = ops::process_create(&c, db::now_ms(), &title, color_tag, board_date.as_deref())?;
    changed(&app);
    Ok(r)
}

#[tauri::command]
pub async fn process_switch(
    app: AppHandle,
    state: State<'_, DbState>,
    pid: i64,
    breakpoint: Option<String>,
) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_switch(&c, db::now_ms(), pid, breakpoint.as_deref())?;
    changed(&app);
    sync_notify(&app, true);
    Ok(())
}

#[tauri::command]
pub async fn process_complete(app: AppHandle, state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_complete(&c, db::now_ms(), pid)?;
    changed(&app);
    sync_notify(&app, true);
    Ok(())
}

#[tauri::command]
pub async fn process_reopen(app: AppHandle, state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_reopen(&c, db::now_ms(), pid)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn process_pause(app: AppHandle, state: State<'_, DbState>, pid: i64, at_ms: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_pause(&c, at_ms.unwrap_or_else(db::now_ms), pid)?;
    changed(&app);
    sync_notify(&app, true);
    Ok(())
}

#[tauri::command]
pub async fn process_resume(app: AppHandle, state: State<'_, DbState>, pid: i64, at_ms: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_resume(&c, at_ms.unwrap_or_else(db::now_ms), pid)?;
    changed(&app);
    sync_notify(&app, true);
    Ok(())
}

#[tauri::command]
pub async fn breakpoint_set(app: AppHandle, state: State<'_, DbState>, pid: i64, text: String) -> Result<(), String> {
    let c = lock(&state)?;
    ops::breakpoint_set(&c, db::now_ms(), pid, &text)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn color_set(app: AppHandle, state: State<'_, DbState>, pid: i64, slot: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::color_set(&c, db::now_ms(), pid, slot)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn waiting_ai_set(app: AppHandle, state: State<'_, DbState>, pid: i64, on: bool) -> Result<(), String> {
    let c = lock(&state)?;
    ops::waiting_ai_set(&c, db::now_ms(), pid, on)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn entry_delete(app: AppHandle, state: State<'_, DbState>, step_id: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::entry_delete(&c, db::now_ms(), step_id)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn entry_rename(
    app: AppHandle,
    state: State<'_, DbState>,
    step_id: i64,
    title: String,
) -> Result<(), String> {
    let c = lock(&state)?;
    ops::entry_rename(&c, db::now_ms(), step_id, &title)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn step_add(app: AppHandle, state: State<'_, DbState>, pid: i64, title: String) -> Result<i64, String> {
    let c = lock(&state)?;
    let r = ops::step_add(&c, db::now_ms(), pid, &title)?;
    changed(&app);
    Ok(r)
}

#[tauri::command]
pub async fn step_check(app: AppHandle, state: State<'_, DbState>, step_id: i64, done: bool) -> Result<(), String> {
    let c = lock(&state)?;
    ops::step_check(&c, db::now_ms(), step_id, done)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn steps_reorder(app: AppHandle, state: State<'_, DbState>, pid: i64, ordered_step_ids: Vec<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::steps_reorder(&c, db::now_ms(), pid, &ordered_step_ids)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn queue_reorder(app: AppHandle, state: State<'_, DbState>, day: String, ordered_pids: Vec<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::queue_reorder(&c, db::now_ms(), &day, &ordered_pids)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn plan_create(
    app: AppHandle,
    state: State<'_, DbState>,
    title: String,
    est_minutes: Option<i64>,
    scheduled_date: Option<String>,
) -> Result<i64, String> {
    let c = lock(&state)?;
    let r = ops::plan_create(&c, db::now_ms(), &title, est_minutes, scheduled_date.as_deref())?;
    changed(&app);
    Ok(r)
}

#[tauri::command]
pub async fn plan_update(
    app: AppHandle,
    state: State<'_, DbState>,
    id: i64,
    title: Option<String>,
    est_minutes: Option<i64>,
    scheduled_date: Option<String>,
) -> Result<(), String> {
    let c = lock(&state)?;
    ops::plan_update(&c, db::now_ms(), id, title.as_deref(), est_minutes, scheduled_date.as_deref())?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn plan_done(app: AppHandle, state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::plan_done(&c, db::now_ms(), id)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn plan_delete(app: AppHandle, state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::plan_delete(&c, db::now_ms(), id)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn plan_reopen(app: AppHandle, state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::plan_reopen(&c, db::now_ms(), id)?;
    changed(&app);
    Ok(())
}

// ---------- 系统层事件 ----------

#[tauri::command]
pub async fn idle_start(app: AppHandle, state: State<'_, DbState>, running_pid: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::idle_start(&c, db::now_ms(), running_pid)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn idle_end(app: AppHandle, state: State<'_, DbState>, running_pid: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::idle_end(&c, db::now_ms(), running_pid)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn rest_trigger(
    app: AppHandle,
    state: State<'_, DbState>,
    pid: Option<i64>,
    source: String,
    reading_ms: i64,
) -> Result<(), String> {
    let c = lock(&state)?;
    ops::rest_trigger(&c, db::now_ms(), pid, &source, reading_ms)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn rest_choice(app: AppHandle, state: State<'_, DbState>, pid: Option<i64>, choice: String) -> Result<(), String> {
    let c = lock(&state)?;
    ops::rest_choice(&c, db::now_ms(), pid, &choice)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn rest_start(app: AppHandle, state: State<'_, DbState>, pid: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::rest_start(&c, db::now_ms(), pid)?;
    changed(&app);
    sync_notify(&app, true);
    Ok(())
}

#[tauri::command]
pub async fn rest_end(app: AppHandle, state: State<'_, DbState>, pid: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::rest_end(&c, db::now_ms(), pid)?;
    changed(&app);
    sync_notify(&app, true);
    Ok(())
}

#[tauri::command]
pub async fn slice_complete(app: AppHandle, state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::slice_complete(&c, db::now_ms(), pid)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn slice_aborted(app: AppHandle, state: State<'_, DbState>, pid: i64, elapsed_ms: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::slice_aborted(&c, db::now_ms(), pid, elapsed_ms)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn segment_note(app: AppHandle, state: State<'_, DbState>, segment_id: i64, note: String) -> Result<(), String> {
    let c = lock(&state)?;
    ops::segment_note(&c, db::now_ms(), segment_id, &note)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn process_rename(app: AppHandle, state: State<'_, DbState>, pid: i64, title: String) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_rename(&c, db::now_ms(), pid, &title)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn notes_set(app: AppHandle, state: State<'_, DbState>, pid: i64, notes: String) -> Result<(), String> {
    let c = lock(&state)?;
    ops::notes_set(&c, db::now_ms(), pid, &notes)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn setting_set(app: AppHandle, state: State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    let c = lock(&state)?;
    ops::setting_set(&c, db::now_ms(), &key, &value)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn idle_confirm(app: AppHandle, state: State<'_, DbState>, pid: i64, yes: bool) -> Result<(), String> {
    let c = lock(&state)?;
    ops::idle_confirm(&c, db::now_ms(), pid, yes)?;
    changed(&app);
    Ok(())
}

// ---------- 查询 ----------

#[tauri::command]
pub async fn q_first_day(state: State<'_, DbState>) -> Result<Option<String>, String> {
    let c = lock(&state)?;
    queries::q_first_day(&c)
}

#[tauri::command]
pub async fn q_board(state: State<'_, DbState>, day: String) -> Result<BoardDay, String> {
    let c = lock(&state)?;
    queries::q_board(&c, &day)
}

#[tauri::command]
pub async fn q_process_day_total(state: State<'_, DbState>, pid: i64, day: String) -> Result<i64, String> {
    let c = lock(&state)?;
    queries::q_process_day_total(&c, pid, &day)
}

#[tauri::command]
pub async fn q_suspended_ms(state: State<'_, DbState>, pid: i64, day: String) -> Result<i64, String> {
    let c = lock(&state)?;
    queries::q_suspended_ms(&c, pid, &day)
}

#[tauri::command]
pub async fn q_slice_stats(state: State<'_, DbState>, pid: i64, day: String) -> Result<SliceStats, String> {
    let c = lock(&state)?;
    queries::q_slice_stats(&c, pid, &day)
}

#[tauri::command]
pub async fn q_continuous_work_ms(state: State<'_, DbState>, day: String) -> Result<i64, String> {
    let c = lock(&state)?;
    queries::q_continuous_work_ms(&c, &day)
}

#[tauri::command]
pub async fn q_events(state: State<'_, DbState>, day: Option<String>) -> Result<Vec<Event>, String> {
    let c = lock(&state)?;
    queries::q_events(&c, day.as_deref())
}

#[tauri::command]
pub async fn q_settings(state: State<'_, DbState>) -> Result<Vec<(String, String)>, String> {
    let c = lock(&state)?;
    queries::q_settings(&c)
}

#[tauri::command]
pub async fn q_palette(state: State<'_, DbState>) -> Result<Vec<PaletteEntry>, String> {
    let c = lock(&state)?;
    queries::q_palette(&c)
}

#[tauri::command]
pub async fn q_plans(state: State<'_, DbState>) -> Result<Vec<Plan>, String> {
    let c = lock(&state)?;
    queries::q_plans(&c)
}

#[tauri::command]
pub async fn q_segments(state: State<'_, DbState>, pid: i64, day: String) -> Result<Vec<Segment>, String> {
    let c = lock(&state)?;
    queries::q_segments(&c, pid, &day)
}

#[tauri::command]
pub async fn q_process_detail(state: State<'_, DbState>, pid: i64, day: String) -> Result<queries::ProcessDetail, String> {
    let c = lock(&state)?;
    queries::q_process_detail(&c, pid, &day)
}

#[tauri::command]
pub async fn q_notes_digest(state: State<'_, DbState>) -> Result<Vec<queries::NoteEntry>, String> {
    let c = lock(&state)?;
    queries::q_notes_digest(&c)
}

#[tauri::command]
pub async fn q_rest_state(state: State<'_, DbState>) -> Result<RestState, String> {
    let c = lock(&state)?;
    queries::q_rest_state(&c)
}

// ---------- M3 统计查询 ----------

#[tauri::command]
pub async fn q_day_stats(state: State<'_, DbState>, day: String) -> Result<queries::DayStats, String> {
    let c = lock(&state)?;
    queries::q_day_stats(&c, &day)
}

#[tauri::command]
pub async fn q_month_calendar(state: State<'_, DbState>, year: i64, month: i64) -> Result<Vec<queries::DayShares>, String> {
    let c = lock(&state)?;
    queries::q_month_calendar(&c, year, month)
}

#[tauri::command]
pub async fn q_year_overview(state: State<'_, DbState>, year: i64) -> Result<queries::YearOverview, String> {
    let c = lock(&state)?;
    queries::q_year_overview(&c, year)
}

#[tauri::command]
pub async fn q_day_view(state: State<'_, DbState>, day: String) -> Result<queries::DayView, String> {
    let c = lock(&state)?;
    queries::q_day_view(&c, &day)
}

#[tauri::command]
pub async fn q_day_grid(state: State<'_, DbState>, day: String) -> Result<Vec<queries::GridCell>, String> {
    let c = lock(&state)?;
    queries::q_day_grid(&c, &day)
}

/// 事件日志导出：JSON 写入 app_data_dir/exports/events-YYYYMMDD-HHmm.json，返回路径
#[tauri::command]
pub async fn export_events(app: AppHandle, state: State<'_, DbState>) -> Result<String, String> {
    let events = {
        let c = lock(&state)?;
        queries::q_events(&c, None)?
    };
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let now = chrono::Local::now();
    let path = dir.join(format!("events-{}-{:02}{:02}.json", now.format("%Y%m%d"), now.format("%H"), now.format("%M")));
    let json = serde_json::to_string_pretty(&events).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn slice_override(app: AppHandle, state: State<'_, DbState>, pid: i64, minutes: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::slice_override(&c, db::now_ms(), pid, minutes)?;
    changed(&app);
    Ok(())
}

// ---------- 数据导入导出（快照 *.fermata.json） ----------

use serde_json::Value;
use tauri_plugin_dialog::DialogExt;

/// 可测层：导出全量快照到指定路径
#[tauri::command]
pub async fn export_snapshot_to(state: State<'_, DbState>, path: String) -> Result<String, String> {
    let c = lock(&state)?;
    db::snapshot::write_snapshot_file(&c, std::path::Path::new(&path))
}

/// 对话框层：另存为（默认文档目录 + fermata-YYYY-MM-DD.fermata.json）
#[tauri::command]
#[cfg(desktop)]
pub async fn export_snapshot_dialog(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Option<String>, String> {
    let default_name = format!("fermata-{}.fermata.json", chrono::Local::now().format("%Y-%m-%d"));
    let mut d = app.dialog().file().add_filter("Fermata 快照", &["json"]);
    if let Ok(dir) = app.path().document_dir() {
        d = d.set_directory(dir);
    }
    let picked = d.set_file_name(&default_name).blocking_save_file();
    match picked {
        Some(p) => {
            let path = p.into_path().map_err(|e| e.to_string())?;
            let c = lock(&state)?;
            let out = db::snapshot::write_snapshot_file(&c, &path)?;
            Ok(Some(out))
        }
        None => Ok(None),
    }
}

/// 可测层：读 + 解析 + 校验（不碰库），返回摘要给确认覆盖层
#[tauri::command]
pub async fn import_snapshot_check(path: String) -> Result<Value, String> {
    let v = db::snapshot::read_snapshot_file(std::path::Path::new(&path))?;
    Ok(db::snapshot::summarize(&v))
}

/// 可测层：备份当前库 → 事务导入 → 返回 {backup, processes, events}
#[tauri::command]
pub async fn import_snapshot_from(
    app: AppHandle,
    state: State<'_, DbState>,
    path: String,
) -> Result<Value, String> {
    let v = db::snapshot::read_snapshot_file(std::path::Path::new(&path))?; // 校验失败零副作用
    let backup = {
        let c = lock(&state)?;
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|e| e.to_string())?
            .join("exports");
        db::snapshot::backup_current(&c, &dir)?
    };
    {
        let c = lock(&state)?;
        db::snapshot::import_snapshot(&c, &v)?;
    }
    changed(&app);
    let mut s = db::snapshot::summarize(&v);
    if let Some(m) = s.as_object_mut() {
        m.insert("backup".into(), Value::String(backup));
    }
    Ok(s)
}

/// 对话框层：打开快照文件（.json 过滤，文档目录起）
#[tauri::command]
#[cfg(desktop)]
pub async fn import_snapshot_dialog(app: AppHandle) -> Result<Option<String>, String> {
    let mut d = app.dialog().file().add_filter("Fermata 快照", &["json"]);
    if let Ok(dir) = app.path().document_dir() {
        d = d.set_directory(dir);
    }
    let picked = d.blocking_pick_file();
    Ok(picked
        .and_then(|p| p.into_path().ok())
        .map(|p| p.to_string_lossy().to_string()))
}

/// 事件日志导出（保留为次要行）：改走另存为对话框，不再默认写 exports 目录
#[tauri::command]
#[cfg(desktop)]
pub async fn export_events_dialog(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<Option<String>, String> {
    let default_name = format!("fermata-events-{}.json", chrono::Local::now().format("%Y-%m-%d"));
    let mut d = app.dialog().file().add_filter("JSON", &["json"]);
    if let Ok(dir) = app.path().document_dir() {
        d = d.set_directory(dir);
    }
    let picked = d.set_file_name(&default_name).blocking_save_file();
    match picked {
        Some(p) => {
            let path = p.into_path().map_err(|e| e.to_string())?;
            let events = {
                let c = lock(&state)?;
                queries::q_events(&c, None)?
            };
            std::fs::write(&path, serde_json::to_string_pretty(&events).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            Ok(Some(path.to_string_lossy().to_string()))
        }
        None => Ok(None),
    }
}

// ---------- 数据存储位置 ----------

use crate::db::DbPathState;

/// 当前库文件路径
#[tauri::command]
pub async fn q_data_location(path_state: State<'_, DbPathState>) -> Result<String, String> {
    let p = path_state.inner().0.lock().map_err(|e| e.to_string())?;
    Ok(p.to_string_lossy().to_string())
}

/// 可测层：切换到目标目录（已有库=接续，没有=复制迁移）
#[tauri::command]
pub async fn set_data_location_to(
    app: AppHandle,
    state: State<'_, DbState>,
    path_state: State<'_, DbPathState>,
    target_dir: String,
) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let target = std::path::PathBuf::from(&target_dir);
    let (new_path, adopted) = {
        let c = lock(&state)?;
        let cur = path_state.inner().0.lock().map_err(|e| e.to_string())?.clone();
        db::location::switch(&c, &cur, &app_dir, &target)?
    };
    // 换连接 + 换路径状态（先开新再丢旧，失败留在旧库）
    let new_conn = db::open(&new_path)?;
    *state.inner().0.lock().map_err(|e| e.to_string())? = new_conn;
    *path_state.inner().0.lock().map_err(|e| e.to_string())? = new_path.clone();
    changed(&app);
    Ok(serde_json::json!({
        "path": new_path.to_string_lossy(),
        "adopted": adopted,
    }))
}

/// 对话框层：系统文件夹选择 → 切换
#[tauri::command]
#[cfg(desktop)]
pub async fn set_data_location_dialog(
    app: AppHandle,
    state: State<'_, DbState>,
    path_state: State<'_, DbPathState>,
) -> Result<Option<Value>, String> {
    let mut d = app.dialog().file();
    // 弹窗起始目录 = 当前库所在目录（先让用户看到"现在在哪儿"），取不到再回落"文档"
    let start = {
        let cur = path_state.inner().0.lock().map_err(|e| e.to_string())?.clone();
        cur.parent()
            .map(|p| p.to_path_buf())
            .filter(|p| p.is_dir())
            .or_else(|| app.path().document_dir().ok())
    };
    if let Some(dir) = start {
        d = d.set_directory(dir);
    }
    let picked = d.blocking_pick_folder();
    match picked {
        Some(p) => {
            let dir = p.into_path().map_err(|e| e.to_string())?;
            set_data_location_to(app, state, path_state, dir.to_string_lossy().to_string())
                .await
                .map(Some)
        }
        None => Ok(None),
    }
}

/// 回默认位置（AppData）：清指针 + 换连接
#[tauri::command]
pub async fn reset_data_location(
    app: AppHandle,
    state: State<'_, DbState>,
    path_state: State<'_, DbPathState>,
) -> Result<Value, String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let default_db = db::location::reset(&app_dir)?;
    let new_conn = db::open(&default_db)?;
    *state.inner().0.lock().map_err(|e| e.to_string())? = new_conn;
    *path_state.inner().0.lock().map_err(|e| e.to_string())? = default_db.clone();
    changed(&app);
    Ok(serde_json::json!({ "path": default_db.to_string_lossy(), "adopted": true }))
}

// ---------- 同步（M4m，docs/07-移动端.md §5） ----------

use crate::sync;
use std::sync::atomic::{AtomicU64, Ordering};

/// 串行门：同一时刻只允许一个同步在跑
static SYNC_GATE: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
/// 文本编辑防抖代际（30 秒无新编辑才推）
static DEBOUNCE_GEN: AtomicU64 = AtomicU64::new(0);
/// 拉取节流：启动 / 回前台距上次 <5 分钟不真拉（docs/07 §5）
static LAST_PULL_MS: AtomicU64 = AtomicU64::new(0);

fn sync_notify(app: &AppHandle, immediate: bool) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        {
            let st = app.state::<DbState>();
            let c = match st.0.lock() { Ok(c) => c, Err(_) => return };
            if !sync::configured(&c) {
                return;
            }
        }
        if !immediate {
            let g = DEBOUNCE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            if DEBOUNCE_GEN.load(Ordering::SeqCst) != g {
                return;
            }
        }
        let _guard = SYNC_GATE.lock().await;
        if let Err(e) = sync_run_bg(&app, None).await {
            crate::log_line(&format!("[sync] 后台同步失败: {e}"));
        }
    });
}

async fn sync_run_bg(app: &AppHandle, force: Option<sync::Force>) -> Result<sync::Outcome, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let state = app.state::<DbState>();
    let cfg = {
        let c = state.0.lock().map_err(|e| e.to_string())?;
        sync::load_cfg(&c, &dir)?
    }
    .ok_or("同步未配置")?;
    let with_conn = |f: &mut dyn FnMut(&rusqlite::Connection) -> Result<(), String>| -> Result<(), String> {
        let c = state.0.lock().map_err(|e| e.to_string())?;
        f(&c)
    };
    let out = sync::run(&cfg, &dir, &with_conn, force).await?;
    let (lock_draft, self_id) = {
        let c = state.0.lock().map_err(|e| e.to_string())?;
        sync::record_result(&c, &out)?;
        (sync::lock_current(&c).ok().flatten(), sync::device_id(&c).ok())
    };
    if let Some(sid) = self_id {
        let _ = sync::lock_sync(&cfg, lock_draft.as_ref(), &sid).await; // 锁刷新失败不挡同步结果
    }
    let _ = app.emit("sync-done", &out);
    let _ = app.emit("store-changed", ());
    Ok(out)
}

#[tauri::command]
pub async fn sync_connect(
    app: AppHandle,
    state: State<'_, DbState>,
    url: String,
    user: String,
    password: String,
) -> Result<sync::Outcome, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    {
        let c = lock(&state)?;
        sync::connect(&c, &dir, &url, &user, &password)?;
    }
    let _ = app.emit("store-changed", ());
    // 连接后立即同步一次：远端空直接推 / 本机空直接拉 / 两端互不基于 → first_conflict 交前端选方向
    let _guard = SYNC_GATE.lock().await;
    sync_run_bg(&app, None).await
}

#[tauri::command]
pub async fn sync_disconnect(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    {
        let c = lock(&state)?;
        sync::disconnect(&c, &dir)?;
    }
    let _ = app.emit("store-changed", ());
    Ok(())
}

/// 立即同步；force = "push" | "pull" 用于首接冲突选方向
#[tauri::command]
pub async fn sync_now(app: AppHandle, force: Option<String>) -> Result<sync::Outcome, String> {
    let f = match force.as_deref() {
        Some("push") => Some(sync::Force::Push),
        Some("pull") => Some(sync::Force::Pull),
        _ => None,
    };
    let _guard = SYNC_GATE.lock().await;
    sync_run_bg(&app, f).await
}

/// 启动 / 回前台拉取（5 分钟节流，docs/07 §5）
#[tauri::command]
pub async fn sync_pull(app: AppHandle) -> Result<sync::Outcome, String> {
    let now = crate::db::now_ms() as u64;
    let last = LAST_PULL_MS.swap(now, Ordering::SeqCst);
    if last > 0 && now.saturating_sub(last) < 5 * 60_000 {
        return Ok(sync::Outcome {
            status: "throttled".into(),
            detail: "距上次拉取不足 5 分钟".into(),
            rev: 0,
        });
    }
    let _guard = SYNC_GATE.lock().await;
    sync_run_bg(&app, None).await
}

#[tauri::command]
pub fn sync_status(state: State<'_, DbState>) -> Result<serde_json::Value, String> {
    let c = lock(&state)?;
    Ok(sync::status(&c))
}

/// 其他设备的运行锁（行内「在 X 设备运行中」徽标）
#[tauri::command]
pub async fn sync_locks(app: AppHandle) -> Result<Vec<sync::RemoteLock>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let (cfg, self_id) = {
        let state = app.state::<DbState>();
        let c = state.0.lock().map_err(|e| e.to_string())?;
        (sync::load_cfg(&c, &dir)?, sync::device_id(&c).ok())
    };
    let cfg = cfg.ok_or("同步未配置")?;
    sync::lock_read_others(&cfg, &self_id.unwrap_or_default()).await
}

/// 运行中心跳：刷新本机锁标记（前端 5 分钟一次，有运行时）
#[tauri::command]
pub async fn sync_lock_refresh(app: AppHandle) -> Result<&'static str, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let (cfg, draft, self_id) = {
        let state = app.state::<DbState>();
        let c = state.0.lock().map_err(|e| e.to_string())?;
        (sync::load_cfg(&c, &dir)?, sync::lock_current(&c).ok().flatten(), sync::device_id(&c).ok())
    };
    let cfg = cfg.ok_or("同步未配置")?;
    sync::lock_sync(&cfg, draft.as_ref(), &self_id.unwrap_or_default()).await
}

/// 显式接管（docs/07 §5）：先强制拉对端最新（本机脏则先备份）→ 以对端锁标记时刻收界 → 本端开始 → 立即推
#[tauri::command]
pub async fn sync_takeover(app: AppHandle, pid: i64) -> Result<sync::Outcome, String> {
    let _guard = SYNC_GATE.lock().await;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    // 1. 对齐远端：能拉就拉（本地改动自动备份），远端没有快照则跳过
    match sync_run_bg(&app, Some(sync::Force::Pull)).await {
        Ok(_) => {}
        Err(e) if e.contains("远端还没有快照") => {}
        Err(e) => return Err(e),
    }
    // 2. 对端锁：取最新一条的 written_at 作收界
    let (cfg, self_id) = {
        let state = app.state::<DbState>();
        let c = state.0.lock().map_err(|e| e.to_string())?;
        (sync::load_cfg(&c, &dir)?, sync::device_id(&c).ok())
    };
    let cfg = cfg.ok_or("同步未配置")?;
    let locks = sync::lock_read_others(&cfg, &self_id.unwrap_or_default()).await?;
    let Some(lk) = locks.iter().max_by_key(|l| l.written_at).cloned() else {
        return Err("没有对端的运行标记可接管".into());
    };
    // 3. 接管 + 立即推（让对端尽快看到）
    {
        let state = app.state::<DbState>();
        let c = state.0.lock().map_err(|e| e.to_string())?;
        ops::takeover(&c, db::now_ms(), pid, lk.written_at)?;
    }
    let _ = app.emit("store-changed", ());
    sync_run_bg(&app, None).await
}
