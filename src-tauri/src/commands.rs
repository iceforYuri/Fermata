//! tauri command 薄壳：锁 DbState → 调 db::ops/queries。全部 async（同步 command 派发到主线程会死锁）。

use crate::db::{self, ops, queries, DbState, Event, PaletteEntry, Plan};
use queries::{BoardDay, SliceStats};
use std::sync::MutexGuard;
use tauri::State;

fn lock<'a, 'r: 'a>(
    state: &'a State<'r, DbState>,
) -> Result<MutexGuard<'a, rusqlite::Connection>, String> {
    state.inner().0.lock().map_err(|e| format!("DB 锁中毒: {e}"))
}

// ---------- 变更 ----------

#[tauri::command]
pub async fn process_create(
    state: State<'_, DbState>,
    title: String,
    color_tag: Option<i64>,
    board_date: Option<String>,
) -> Result<i64, String> {
    let c = lock(&state)?;
    ops::process_create(&c, db::now_ms(), &title, color_tag, board_date.as_deref())
}

#[tauri::command]
pub async fn process_switch(
    state: State<'_, DbState>,
    pid: i64,
    breakpoint: Option<String>,
) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_switch(&c, db::now_ms(), pid, breakpoint.as_deref())
}

#[tauri::command]
pub async fn process_complete(state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_complete(&c, db::now_ms(), pid)
}

#[tauri::command]
pub async fn process_reopen(state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_reopen(&c, db::now_ms(), pid)
}

#[tauri::command]
pub async fn process_pause(state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_pause(&c, db::now_ms(), pid)
}

#[tauri::command]
pub async fn process_resume(state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::process_resume(&c, db::now_ms(), pid)
}

#[tauri::command]
pub async fn breakpoint_set(state: State<'_, DbState>, pid: i64, text: String) -> Result<(), String> {
    let c = lock(&state)?;
    ops::breakpoint_set(&c, db::now_ms(), pid, &text)
}

#[tauri::command]
pub async fn color_set(state: State<'_, DbState>, pid: i64, slot: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::color_set(&c, db::now_ms(), pid, slot)
}

#[tauri::command]
pub async fn waiting_ai_set(state: State<'_, DbState>, pid: i64, on: bool) -> Result<(), String> {
    let c = lock(&state)?;
    ops::waiting_ai_set(&c, db::now_ms(), pid, on)
}

#[tauri::command]
pub async fn step_add(state: State<'_, DbState>, pid: i64, title: String) -> Result<i64, String> {
    let c = lock(&state)?;
    ops::step_add(&c, db::now_ms(), pid, &title)
}

#[tauri::command]
pub async fn step_check(state: State<'_, DbState>, step_id: i64, done: bool) -> Result<(), String> {
    let c = lock(&state)?;
    ops::step_check(&c, db::now_ms(), step_id, done)
}

#[tauri::command]
pub async fn steps_reorder(
    state: State<'_, DbState>,
    pid: i64,
    ordered_step_ids: Vec<i64>,
) -> Result<(), String> {
    let c = lock(&state)?;
    ops::steps_reorder(&c, db::now_ms(), pid, &ordered_step_ids)
}

#[tauri::command]
pub async fn queue_reorder(
    state: State<'_, DbState>,
    day: String,
    ordered_pids: Vec<i64>,
) -> Result<(), String> {
    let c = lock(&state)?;
    ops::queue_reorder(&c, db::now_ms(), &day, &ordered_pids)
}

#[tauri::command]
pub async fn plan_create(
    state: State<'_, DbState>,
    title: String,
    est_minutes: Option<i64>,
    scheduled_date: Option<String>,
) -> Result<i64, String> {
    let c = lock(&state)?;
    ops::plan_create(&c, db::now_ms(), &title, est_minutes, scheduled_date.as_deref())
}

#[tauri::command]
pub async fn plan_update(
    state: State<'_, DbState>,
    id: i64,
    title: Option<String>,
    est_minutes: Option<i64>,
    scheduled_date: Option<String>,
) -> Result<(), String> {
    let c = lock(&state)?;
    ops::plan_update(&c, db::now_ms(), id, title.as_deref(), est_minutes, scheduled_date.as_deref())
}

#[tauri::command]
pub async fn plan_done(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::plan_done(&c, db::now_ms(), id)
}

#[tauri::command]
pub async fn plan_delete(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::plan_delete(&c, db::now_ms(), id)
}

// ---------- 系统层事件（M2 空闲/休止符/时间环写入口） ----------

#[tauri::command]
pub async fn idle_start(state: State<'_, DbState>, running_pid: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::idle_start(&c, db::now_ms(), running_pid)
}

#[tauri::command]
pub async fn idle_end(state: State<'_, DbState>, running_pid: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::idle_end(&c, db::now_ms(), running_pid)
}

#[tauri::command]
pub async fn rest_trigger(
    state: State<'_, DbState>,
    pid: Option<i64>,
    source: String,
    reading_ms: i64,
) -> Result<(), String> {
    let c = lock(&state)?;
    ops::rest_trigger(&c, db::now_ms(), pid, &source, reading_ms)
}

#[tauri::command]
pub async fn rest_choice(state: State<'_, DbState>, pid: Option<i64>, choice: String) -> Result<(), String> {
    let c = lock(&state)?;
    ops::rest_choice(&c, db::now_ms(), pid, &choice)
}

#[tauri::command]
pub async fn rest_start(state: State<'_, DbState>, pid: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::rest_start(&c, db::now_ms(), pid)
}

#[tauri::command]
pub async fn rest_end(state: State<'_, DbState>, pid: Option<i64>) -> Result<(), String> {
    let c = lock(&state)?;
    ops::rest_end(&c, db::now_ms(), pid)
}

#[tauri::command]
pub async fn slice_complete(state: State<'_, DbState>, pid: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::slice_complete(&c, db::now_ms(), pid)
}

#[tauri::command]
pub async fn slice_aborted(state: State<'_, DbState>, pid: i64, elapsed_ms: i64) -> Result<(), String> {
    let c = lock(&state)?;
    ops::slice_aborted(&c, db::now_ms(), pid, elapsed_ms)
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
