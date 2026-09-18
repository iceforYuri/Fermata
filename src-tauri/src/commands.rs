//! tauri command 薄壳：锁 DbState → 调 db::ops/queries。全部 async（同步 command 派发到主线程会死锁）。
//! 变更命令成功后广播 "store-changed"，全部窗口监听重取（跨窗状态同步）。

use crate::db::{self, ops, queries, DbState, Event, PaletteEntry, Plan, Segment};
use queries::{BoardDay, RestState, SliceStats};
use std::sync::MutexGuard;
use tauri::{AppHandle, Emitter, State};

fn lock<'a, 'r: 'a>(
    state: &'a State<'r, DbState>,
) -> Result<MutexGuard<'a, rusqlite::Connection>, String> {
    state.inner().0.lock().map_err(|e| format!("DB 锁中毒: {e}"))
}

fn changed(app: &AppHandle) {
    let _ = app.emit("store-changed", ());
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
    Ok(())
}

#[tauri::command]
pub async fn process_complete(app: AppHandle, state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_complete(&c, db::now_ms(), pid)?;
    changed(&app);
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
pub async fn process_pause(app: AppHandle, state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_pause(&c, db::now_ms(), pid)?;
    changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn process_resume(app: AppHandle, state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_resume(&c, db::now_ms(), pid)?;
    changed(&app);
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
    Ok(())
}

#[tauri::command]
pub async fn rest_end(app: AppHandle, state: State<'_, DbState>, pid: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::rest_end(&c, db::now_ms(), pid)?;
    changed(&app);
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
pub async fn q_rest_state(state: State<'_, DbState>) -> Result<RestState, String> {
    let c = lock(&state)?;
    queries::q_rest_state(&c)
}
