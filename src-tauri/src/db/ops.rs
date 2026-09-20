//! 变更操作：状态机 + 事件 + segments 维护。
//! 所有函数显式接收 ts（epoch ms），保证种子与测试的确定性。

use super::{append_event, close_open_segment, day_of, get_process, last_timer_closer, open_segment, timer_open};
use rusqlite::Connection;
use serde_json::json;

fn set_state(conn: &Connection, pid: i64, state: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE processes SET state = ?2 WHERE id = ?1",
        rusqlite::params![pid, state],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// MRU：被切走的进程落挂起队列首位（其余后移）
fn push_queue_head(conn: &Connection, pid: i64, board_date: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE processes SET queue_position = queue_position + 1 WHERE board_date = ?1 AND queue_position IS NOT NULL",
        rusqlite::params![board_date],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE processes SET queue_position = 1 WHERE id = ?1",
        rusqlite::params![pid],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn push_queue_tail(conn: &Connection, pid: i64, board_date: &str) -> Result<(), String> {
    let max_pos: Option<i64> = conn
        .query_row(
            "SELECT MAX(queue_position) FROM processes WHERE board_date = ?1 AND queue_position IS NOT NULL",
            rusqlite::params![board_date],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE processes SET queue_position = ?2 WHERE id = ?1",
        rusqlite::params![pid, max_pos.unwrap_or(0) + 1],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 新建进程，进当日版面挂起队列尾部。
pub fn process_create(
    conn: &Connection,
    ts: i64,
    title: &str,
    color_tag: Option<i64>,
    board_date: Option<&str>,
) -> Result<i64, String> {
    if let Some(slot) = color_tag {
        if !(0..=6).contains(&slot) {
            return Err(format!("色标槽位须为 0..6，收到 {slot}"));
        }
    }
    let day = board_date.map(str::to_string).unwrap_or_else(|| day_of(ts));
    conn.execute(
        "INSERT INTO processes (title, state, color_tag, created_at, board_date) VALUES (?1, 'suspended', ?2, ?3, ?4)",
        rusqlite::params![title, color_tag, ts, day],
    )
    .map_err(|e| e.to_string())?;
    let pid = conn.last_insert_rowid();
    push_queue_tail(conn, pid, &day)?;
    append_event(
        conn,
        ts,
        "process_create",
        Some(pid),
        json!({ "title": title, "color_tag": color_tag, "board_date": day }),
    )?;
    Ok(pid)
}

/// 切换：当前运行进程切出（可留断点），目标进程切入运行。目标完成态/运行态均拒绝。
pub fn process_switch(
    conn: &Connection,
    ts: i64,
    pid: i64,
    breakpoint: Option<&str>,
) -> Result<(), String> {
    let target = get_process(conn, pid)?;
    if target.state == "completed" {
        return Err(format!("进程 {pid} 已完成，需先 reopen 才能切入"));
    }
    if target.state == "running" {
        return Err(format!("进程 {pid} 已在运行"));
    }

    let current: Option<i64> = conn
        .query_row(
            "SELECT id FROM processes WHERE state = 'running' LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok();

    if let Some(cur) = current {
        close_open_segment(conn, cur, ts)?;
        if let Some(bp) = breakpoint {
            // 切换留断点 = 压 note 到旧进程栈顶
            conn.execute(
                "UPDATE steps SET position = position + 1 WHERE process_id = ?1",
                rusqlite::params![cur],
            )
            .map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO steps (process_id, title, done, position, kind) VALUES (?1, ?2, 0, 1, 'note')",
                rusqlite::params![cur, bp],
            )
            .map_err(|e| e.to_string())?;
        }
        set_state(conn, cur, "suspended")?;
        let day = get_process(conn, cur)?.board_date;
        push_queue_head(conn, cur, &day)?; // MRU：切出落队首
        append_event(
            conn,
            ts,
            "switch_out",
            Some(cur),
            json!({ "breakpoint": breakpoint, "to": pid }),
        )?;
    }

    // 切入 waiting_ai 进程视为取回：等AI 标记随切入消解
    set_state(conn, pid, "running")?;
    conn.execute(
        "UPDATE processes SET prev_state = NULL, queue_position = NULL, activated_count = activated_count + 1 WHERE id = ?1",
        rusqlite::params![pid],
    )
    .map_err(|e| e.to_string())?;
    append_event(conn, ts, "switch_in", Some(pid), json!({ "from": current }))?;
    open_segment(conn, pid, ts)?;
    Ok(())
}

pub fn process_complete(conn: &Connection, ts: i64, pid: i64) -> Result<(), String> {
    let p = get_process(conn, pid)?;
    if p.state == "completed" {
        return Err(format!("进程 {pid} 已是完成态"));
    }
    close_open_segment(conn, pid, ts)?;
    conn.execute(
        "UPDATE processes SET state = 'completed', prev_state = NULL, completed_at = ?2, queue_position = NULL WHERE id = ?1",
        rusqlite::params![pid, ts],
    )
    .map_err(|e| e.to_string())?;
    append_event(conn, ts, "process_complete", Some(pid), json!({}))?;
    Ok(())
}

/// 完成 → 挂起队列尾部
pub fn process_reopen(conn: &Connection, ts: i64, pid: i64) -> Result<(), String> {
    let p = get_process(conn, pid)?;
    if p.state != "completed" {
        return Err(format!("进程 {pid} 不在完成态，不能 reopen"));
    }
    set_state(conn, pid, "suspended")?;
    conn.execute(
        "UPDATE processes SET completed_at = NULL WHERE id = ?1",
        rusqlite::params![pid],
    )
    .map_err(|e| e.to_string())?;
    push_queue_tail(conn, pid, &p.board_date)?;
    append_event(conn, ts, "process_reopen", Some(pid), json!({}))?;
    Ok(())
}

/// 暂停：运行中计时停止（不是状态切换）。仅在计时开口时合法。
pub fn process_pause(conn: &Connection, ts: i64, pid: i64) -> Result<(), String> {
    let p = get_process(conn, pid)?;
    if p.state != "running" {
        return Err(format!("进程 {pid} 不在运行，不能暂停"));
    }
    if !timer_open(conn, pid)? {
        return Err(format!("进程 {pid} 计时已停（pause/idle/rest）"));
    }
    close_open_segment(conn, pid, ts)?;
    append_event(conn, ts, "pause", Some(pid), json!({}))?;
    Ok(())
}

/// 恢复：仅撤销显式 pause；idle/rest 的计时恢复走 idle_end / rest_end。
pub fn process_resume(conn: &Connection, ts: i64, pid: i64) -> Result<(), String> {
    let p = get_process(conn, pid)?;
    if p.state != "running" {
        return Err(format!("进程 {pid} 不在运行，不能恢复"));
    }
    if timer_open(conn, pid)? {
        return Err(format!("进程 {pid} 计时本就在走"));
    }
    let last_close: Option<String> = last_timer_closer(conn, pid)?;
    if last_close.as_deref() != Some("pause") {
        return Err(format!(
            "进程 {pid} 计时由 {:?} 停止，须走对应恢复路径",
            last_close
        ));
    }
    append_event(conn, ts, "resume", Some(pid), json!({}))?;
    open_segment(conn, pid, ts)?;
    Ok(())
}

/// 写断点 = 压一条 note（断点条）到栈顶（ADR-0005；不再有"手动断点字段"）
pub fn breakpoint_set(conn: &Connection, ts: i64, pid: i64, text: &str) -> Result<(), String> {
    get_process(conn, pid)?;
    conn.execute(
        "UPDATE steps SET position = position + 1 WHERE process_id = ?1",
        rusqlite::params![pid],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO steps (process_id, title, done, position, kind) VALUES (?1, ?2, 0, 1, 'note')",
        rusqlite::params![pid, text],
    )
    .map_err(|e| e.to_string())?;
    append_event(conn, ts, "entry_add", Some(pid), json!({ "kind": "note", "title": text }))?;
    Ok(())
}

/// 删除栈条目（步骤/断点条通用）
pub fn entry_delete(conn: &Connection, ts: i64, step_id: i64) -> Result<(), String> {
    let pid: i64 = conn
        .query_row("SELECT process_id FROM steps WHERE id = ?1", rusqlite::params![step_id], |r| r.get(0))
        .map_err(|e| format!("条目 {step_id} 不存在: {e}"))?;
    conn.execute("DELETE FROM steps WHERE id = ?1", rusqlite::params![step_id])
        .map_err(|e| e.to_string())?;
    append_event(conn, ts, "entry_delete", Some(pid), json!({ "step_id": step_id }))?;
    Ok(())
}

pub fn color_set(conn: &Connection, ts: i64, pid: i64, slot: Option<i64>) -> Result<(), String> {
    get_process(conn, pid)?;
    if let Some(s) = slot {
        if !(0..=6).contains(&s) {
            return Err(format!("色标槽位须为 0..6，收到 {s}"));
        }
    }
    conn.execute(
        "UPDATE processes SET color_tag = ?2 WHERE id = ?1",
        rusqlite::params![pid, slot],
    )
    .map_err(|e| e.to_string())?;
    append_event(conn, ts, "color_set", Some(pid), json!({ "slot": slot }))?;
    Ok(())
}

/// 等AI：任意非完成态 ⇄ waiting_ai，prev_state 记原状态以便还原。
pub fn waiting_ai_set(conn: &Connection, ts: i64, pid: i64, on: bool) -> Result<(), String> {
    let p = get_process(conn, pid)?;
    if on {
        if p.state == "waiting_ai" {
            return Err(format!("进程 {pid} 已处于等AI"));
        }
        if p.state == "completed" {
            return Err(format!("进程 {pid} 已完成，不能置等AI"));
        }
        if p.state == "running" {
            close_open_segment(conn, pid, ts)?;
        }
        conn.execute(
            "UPDATE processes SET prev_state = state, state = 'waiting_ai' WHERE id = ?1",
            rusqlite::params![pid],
        )
        .map_err(|e| e.to_string())?;
        append_event(
            conn,
            ts,
            "waiting_ai_set",
            Some(pid),
            json!({ "on": true, "prev_state": p.state }),
        )?;
    } else {
        if p.state != "waiting_ai" {
            return Err(format!("进程 {pid} 不在等AI，不能还原"));
        }
        let restored = p.prev_state.clone().unwrap_or_else(|| "suspended".into());
        conn.execute(
            "UPDATE processes SET state = ?2, prev_state = NULL WHERE id = ?1",
            rusqlite::params![pid, restored],
        )
        .map_err(|e| e.to_string())?;
        if restored == "running" {
            open_segment(conn, pid, ts)?;
        }
        append_event(
            conn,
            ts,
            "waiting_ai_set",
            Some(pid),
            json!({ "on": false, "restored": restored }),
        )?;
    }
    Ok(())
}

/// 步骤栈：新步骤置顶（栈顶 position=1，存量下移）
pub fn step_add(conn: &Connection, ts: i64, pid: i64, title: &str) -> Result<i64, String> {
    get_process(conn, pid)?;
    conn.execute(
        "UPDATE steps SET position = position + 1 WHERE process_id = ?1",
        rusqlite::params![pid],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO steps (process_id, title, done, position) VALUES (?1, ?2, 0, 1)",
        rusqlite::params![pid, title],
    )
    .map_err(|e| e.to_string())?;
    let sid = conn.last_insert_rowid();
    append_event(
        conn,
        ts,
        "step_add",
        Some(pid),
        json!({ "step_id": sid, "title": title }),
    )?;
    Ok(sid)
}

pub fn step_check(conn: &Connection, ts: i64, step_id: i64, done: bool) -> Result<(), String> {
    let pid: i64 = conn
        .query_row(
            "SELECT process_id FROM steps WHERE id = ?1",
            rusqlite::params![step_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("步骤 {step_id} 不存在: {e}"))?;
    conn.execute(
        "UPDATE steps SET done = ?2, done_at = ?3 WHERE id = ?1",
        rusqlite::params![step_id, done as i64, if done { Some(ts) } else { None }],
    )
    .map_err(|e| e.to_string())?;
    append_event(
        conn,
        ts,
        "step_check",
        Some(pid),
        json!({ "step_id": step_id, "done": done }),
    )?;
    Ok(())
}

pub fn steps_reorder(
    conn: &Connection,
    ts: i64,
    pid: i64,
    ordered_step_ids: &[i64],
) -> Result<(), String> {
    for (i, sid) in ordered_step_ids.iter().enumerate() {
        let n = conn
            .execute(
                "UPDATE steps SET position = ?3 WHERE id = ?1 AND process_id = ?2",
                rusqlite::params![sid, pid, (i + 1) as i64],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err(format!("步骤 {sid} 不属于进程 {pid}"));
        }
    }
    append_event(
        conn,
        ts,
        "steps_reorder",
        Some(pid),
        json!({ "ordered_step_ids": ordered_step_ids }),
    )?;
    Ok(())
}

pub fn queue_reorder(
    conn: &Connection,
    ts: i64,
    day: &str,
    ordered_pids: &[i64],
) -> Result<(), String> {
    for (i, pid) in ordered_pids.iter().enumerate() {
        let n = conn
            .execute(
                "UPDATE processes SET queue_position = ?3 WHERE id = ?1 AND board_date = ?2 AND state IN ('suspended','waiting_ai')",
                rusqlite::params![pid, day, (i + 1) as i64],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            return Err(format!("进程 {pid} 不在 {day} 挂起队列中"));
        }
    }
    append_event(
        conn,
        ts,
        "queue_reorder",
        None,
        json!({ "day": day, "ordered_pids": ordered_pids }),
    )?;
    Ok(())
}

// ---------- 稿库 ----------

pub fn plan_create(
    conn: &Connection,
    ts: i64,
    title: &str,
    est_minutes: Option<i64>,
    scheduled_date: Option<&str>,
) -> Result<i64, String> {
    let max_pos: Option<i64> = conn
        .query_row("SELECT MAX(position) FROM plans", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO plans (title, est_minutes, scheduled_date, state, created_at, position) VALUES (?1, ?2, ?3, 'pool', ?4, ?5)",
        rusqlite::params![title, est_minutes, scheduled_date, ts, max_pos.unwrap_or(0) + 1],
    )
    .map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    append_event(
        conn,
        ts,
        "plan_create",
        None,
        json!({ "plan_id": id, "title": title, "est_minutes": est_minutes, "scheduled_date": scheduled_date }),
    )?;
    Ok(id)
}

pub fn plan_update(
    conn: &Connection,
    ts: i64,
    id: i64,
    title: Option<&str>,
    est_minutes: Option<i64>,
    scheduled_date: Option<&str>,
) -> Result<(), String> {
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM plans WHERE id = ?1 AND state = 'pool'",
            rusqlite::params![id],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())?
        > 0;
    if !exists {
        return Err(format!("计划 {id} 不在稿库中"));
    }
    if let Some(t) = title {
        conn.execute(
            "UPDATE plans SET title = ?2 WHERE id = ?1",
            rusqlite::params![id, t],
        )
        .map_err(|e| e.to_string())?;
    }
    if est_minutes.is_some() {
        conn.execute(
            "UPDATE plans SET est_minutes = ?2 WHERE id = ?1",
            rusqlite::params![id, est_minutes],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(d) = scheduled_date {
        conn.execute(
            "UPDATE plans SET scheduled_date = ?2 WHERE id = ?1",
            rusqlite::params![id, d],
        )
        .map_err(|e| e.to_string())?;
    }
    append_event(
        conn,
        ts,
        "plan_update",
        None,
        json!({ "plan_id": id, "title": title, "est_minutes": est_minutes, "scheduled_date": scheduled_date }),
    )?;
    Ok(())
}

pub fn plan_done(conn: &Connection, ts: i64, id: i64) -> Result<(), String> {
    let n = conn
        .execute(
            "UPDATE plans SET state = 'completed', completed_at = ?2 WHERE id = ?1 AND state = 'pool'",
            rusqlite::params![id, ts],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("计划 {id} 不在稿库中，不能完成"));
    }
    append_event(conn, ts, "plan_done", None, json!({ "plan_id": id }))?;
    Ok(())
}

pub fn plan_delete(conn: &Connection, ts: i64, id: i64) -> Result<(), String> {
    let n = conn
        .execute(
            "UPDATE plans SET state = 'deleted' WHERE id = ?1 AND state = 'pool'",
            rusqlite::params![id],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err(format!("计划 {id} 不在稿库中，不能删除"));
    }
    append_event(conn, ts, "plan_delete", None, json!({ "plan_id": id }))?;
    Ok(())
}

// ---------- 系统层事件（M2 调用；种子同样经此写入以保 segments 自洽） ----------

/// 环走满：仅记事件（时间环归 M2，segments 不动）
pub fn slice_complete(conn: &Connection, ts: i64, pid: i64) -> Result<(), String> {
    append_event(conn, ts, "slice_complete", Some(pid), json!({}))?;
    Ok(())
}

/// 提前切走、时间片未完成：记事件（由系统层在切走前调用）
pub fn slice_aborted(conn: &Connection, ts: i64, pid: i64, elapsed_ms: i64) -> Result<(), String> {
    append_event(
        conn,
        ts,
        "slice_aborted",
        Some(pid),
        json!({ "elapsed_ms": elapsed_ms }),
    )?;
    Ok(())
}

pub fn idle_start(conn: &Connection, ts: i64, running_pid: Option<i64>) -> Result<(), String> {
    if let Some(pid) = running_pid {
        close_open_segment(conn, pid, ts)?;
    }
    append_event(conn, ts, "idle_start", running_pid, json!({}))?;
    Ok(())
}

pub fn idle_end(conn: &Connection, ts: i64, running_pid: Option<i64>) -> Result<(), String> {
    let (reopen, real_return) = match running_pid {
        Some(pid) => {
            let p = get_process(conn, pid)?;
            let closer = last_timer_closer(conn, pid)?;
            // 只有计时是被 idle_start 停下的才由 idle_end 重开（pause/rest_start 停的不动）；
            // 事件同理：非"从空闲回来"的 idle_end 整条跳过（防守卫污染 resume 判定）
            let was_idle = closer.as_deref() == Some("idle_start");
            (p.state == "running" && !timer_open(conn, pid)? && was_idle, was_idle)
        }
        None => (false, true), // 无进程的全局标记照记
    };
    if !real_return {
        return Ok(());
    }
    append_event(conn, ts, "idle_end", running_pid, json!({}))?;
    if reopen {
        open_segment(conn, running_pid.unwrap(), ts)?;
    }
    Ok(())
}

/// 休止符触发（环走满或连续工作超阈值）
pub fn rest_trigger(
    conn: &Connection,
    ts: i64,
    pid: Option<i64>,
    source: &str,
    reading_ms: i64,
) -> Result<(), String> {
    append_event(
        conn,
        ts,
        "rest_trigger",
        pid,
        json!({ "source": source, "reading_ms": reading_ms }),
    )?;
    Ok(())
}

/// 休止符选择：defer（暂不休息）/ rest（进入休息）/ next（翻下一篇）/ close（✕=进入休息）
pub fn rest_choice(conn: &Connection, ts: i64, pid: Option<i64>, choice: &str) -> Result<(), String> {
    append_event(conn, ts, "rest_choice", pid, json!({ "choice": choice }))?;
    Ok(())
}

/// 进入休息态：计时停（时间的默认值是"不计"）
pub fn rest_start(conn: &Connection, ts: i64, pid: Option<i64>) -> Result<(), String> {
    if let Some(p) = pid {
        close_open_segment(conn, p, ts)?;
    }
    append_event(conn, ts, "rest_start", pid, json!({}))?;
    Ok(())
}

/// 离开休息态（我回来了/继续）：进程仍运行且计时因休息而停则重开
pub fn rest_end(conn: &Connection, ts: i64, pid: Option<i64>) -> Result<(), String> {
    let reopen = match pid {
        Some(p) => {
            let proc = get_process(conn, p)?;
            // 仅计时被 rest_start 停下的才由 rest_end 重开（手动 pause 停的不动）
            proc.state == "running"
                && !timer_open(conn, p)?
                && last_timer_closer(conn, p)?.as_deref() == Some("rest_start")
        }
        None => false,
    };
    append_event(conn, ts, "rest_end", pid, json!({}))?;
    if reopen {
        open_segment(conn, pid.unwrap(), ts)?;
    }
    Ok(())
}

/// 分段备注（详情栏内联编辑）
pub fn segment_note(conn: &Connection, ts: i64, segment_id: i64, note: &str) -> Result<(), String> {
    let pid: i64 = conn
        .query_row(
            "SELECT process_id FROM segments WHERE id = ?1",
            rusqlite::params![segment_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("分段 {segment_id} 不存在: {e}"))?;
    conn.execute(
        "UPDATE segments SET note = ?2 WHERE id = ?1",
        rusqlite::params![segment_id, note],
    )
    .map_err(|e| e.to_string())?;
    append_event(conn, ts, "segment_note", Some(pid), serde_json::json!({ "segment_id": segment_id, "note": note }))?;
    Ok(())
}

/// 改进程标题（详情栏栏头就地编辑）
pub fn process_rename(conn: &Connection, ts: i64, pid: i64, title: &str) -> Result<(), String> {
    get_process(conn, pid)?;
    conn.execute(
        "UPDATE processes SET title = ?2 WHERE id = ?1",
        rusqlite::params![pid, title],
    )
    .map_err(|e| e.to_string())?;
    append_event(conn, ts, "process_rename", Some(pid), serde_json::json!({ "title": title }))?;
    Ok(())
}

/// 个人记录（详情栏沉底自由文本）
pub fn notes_set(conn: &Connection, ts: i64, pid: i64, notes: &str) -> Result<(), String> {
    get_process(conn, pid)?;
    conn.execute(
        "UPDATE processes SET notes = ?2 WHERE id = ?1",
        rusqlite::params![pid, notes],
    )
    .map_err(|e| e.to_string())?;
    append_event(conn, ts, "notes_set", Some(pid), serde_json::json!({})).ok();
    Ok(())
}

/// 设置项写入（M2 置顶/热键/空闲阈值；M4 设置页同源）
pub fn setting_set(conn: &Connection, ts: i64, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    append_event(conn, ts, "setting_set", None, serde_json::json!({ "key": key, "value": value }))?;
    Ok(())
}

pub fn setting_get(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key = ?1", rusqlite::params![key], |r| r.get(0)).ok()
}

/// 空闲回归确认：yes = 把空闲段回补进该进程 focus（合并回原 segment）
pub fn idle_confirm(conn: &Connection, ts: i64, pid: i64, yes: bool) -> Result<(), String> {
    if yes {
        // 合并：删掉空闲后新开的段，把空闲前闭合的段重新打开（开口起点回吞空闲区间）
        let open_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM segments WHERE process_id = ?1 AND ended_at IS NULL ORDER BY id DESC LIMIT 1",
                rusqlite::params![pid],
                |r| r.get(0),
            )
            .ok();
        let last_closed: Option<i64> = conn
            .query_row(
                "SELECT id FROM segments WHERE process_id = ?1 AND ended_at IS NOT NULL ORDER BY id DESC LIMIT 1",
                rusqlite::params![pid],
                |r| r.get(0),
            )
            .ok();
        if let (Some(open_id), Some(closed_id)) = (open_id, last_closed) {
            conn.execute("DELETE FROM segments WHERE id = ?1", rusqlite::params![open_id])
                .map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE segments SET ended_at = NULL WHERE id = ?1",
                rusqlite::params![closed_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    append_event(conn, ts, "idle_confirm", Some(pid), serde_json::json!({ "yes": yes }))?;
    Ok(())
}

/// 本次时间片长度覆盖（只调本次；settings.slice_minutes 不动）
pub fn slice_override(conn: &Connection, ts: i64, pid: i64, minutes: i64) -> Result<(), String> {
    get_process(conn, pid)?;
    append_event(conn, ts, "slice_override", Some(pid), serde_json::json!({ "minutes": minutes }))?;
    Ok(())
}
