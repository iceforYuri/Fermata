pub mod commands;
pub mod db;
#[cfg(windows)]
pub mod desktop_cmds;
#[cfg(desktop)]
pub mod sys;

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::Manager;

pub(crate) const LOG_DIR: &str = "../docs/screenshots/poc";
const LOG_PATH: &str = "../docs/screenshots/poc/poc-runtime.log";

fn now_ms_u128() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

pub(crate) fn log_line(msg: &str) {
    println!("{msg}");
    let _ = fs::create_dir_all(LOG_DIR);
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(LOG_PATH) {
        let _ = writeln!(f, "[{}] {msg}", now_ms_u128());
    }
}

/// 更名迁移：旧数据目录 %APPDATA%\com.gika.dev\gika.db 存在且新目录 fermata.db 不存在时，
/// 复制（不移动）旧库到新目录（含 -wal/-shm 边车文件），全程写日志。
fn migrate_legacy_db(new_dir: &std::path::Path) {
    let new_db = new_dir.join("fermata.db");
    if new_db.exists() {
        return;
    }
    let Some(appdata) = std::env::var_os("APPDATA") else { return };
    let old_dir = std::path::PathBuf::from(appdata).join("com.gika.dev");
    let old_db = old_dir.join("gika.db");
    if !old_db.exists() {
        return;
    }
    if let Err(e) = fs::create_dir_all(new_dir) {
        log_line(&format!("[rename] 创建新数据目录失败: {e}"));
        return;
    }
    let mut copied = Vec::new();
    for (src, dst) in [
        (old_db.clone(), new_db.clone()),
        (old_dir.join("gika.db-wal"), new_dir.join("fermata.db-wal")),
        (old_dir.join("gika.db-shm"), new_dir.join("fermata.db-shm")),
    ] {
        if !src.exists() {
            continue;
        }
        match fs::copy(&src, &dst) {
            Ok(_) => copied.push(format!("{}", src.display())),
            Err(e) => log_line(&format!("[rename] 复制 {:?} 失败: {e}", src)),
        }
    }
    log_line(&format!(
        "[rename] 旧库已复制到新目录（原样保留旧目录）: {:?} → {}",
        copied,
        new_dir.display()
    ));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    let builder = builder
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        log_line("[m2] hotkey fired");
                        sys::toggle_switcher(app);
                    }
                })
                .build(),
        )
        .manage(sys::SysState {
            time_scale: std::sync::Mutex::new(1.0),
            idling: std::sync::Mutex::new(false),
        });

    builder
        .invoke_handler(tauri::generate_handler![
            #[cfg(windows)]
            desktop_cmds::poc_spawn_popup,
            commands::process_create,
            commands::process_switch,
            commands::process_complete,
            commands::process_reopen,
            commands::process_pause,
            commands::process_resume,
            commands::breakpoint_set,
            commands::entry_delete,
            commands::entry_rename,
            commands::color_set,
            commands::waiting_ai_set,
            commands::step_add,
            commands::step_check,
            commands::steps_reorder,
            commands::queue_reorder,
            commands::plan_create,
            commands::plan_update,
            commands::plan_done,
            commands::plan_delete,
            commands::plan_reopen,
            commands::idle_start,
            commands::idle_end,
            commands::rest_trigger,
            commands::rest_choice,
            commands::rest_start,
            commands::rest_end,
            commands::slice_complete,
            commands::slice_aborted,
            commands::slice_override,
            commands::q_board,
            commands::q_process_day_total,
            commands::q_suspended_ms,
            commands::q_slice_stats,
            commands::q_continuous_work_ms,
            commands::q_events,
            commands::q_settings,
            commands::q_palette,
            commands::q_plans,
            commands::q_segments,
            commands::q_process_detail,
            commands::q_notes_digest,
            commands::segment_note,
            commands::process_rename,
            commands::notes_set,
            commands::setting_set,
            commands::idle_confirm,
            commands::q_rest_state,
            commands::q_day_stats,
            commands::q_month_calendar,
            commands::q_year_overview,
            commands::q_day_view,
            commands::q_day_grid,
            commands::q_first_day,
            #[cfg(desktop)]
            sys::summon,
            #[cfg(desktop)]
            sys::conceal,
            #[cfg(desktop)]
            sys::pin,
            #[cfg(desktop)]
            sys::focus_main,
            #[cfg(desktop)]
            sys::show_switcher,
            #[cfg(desktop)]
            sys::hide_switcher,
            #[cfg(desktop)]
            sys::show_restpop,
            #[cfg(desktop)]
            sys::hide_restpop,
            #[cfg(desktop)]
            sys::hotkey_apply,
            #[cfg(desktop)]
            sys::debug_trigger_hotkey,
            #[cfg(desktop)]
            sys::debug_set_time_scale,
            #[cfg(desktop)]
            sys::debug_get_time_scale,
            #[cfg(desktop)]
            sys::idle_current,
            #[cfg(desktop)]
            sys::debug_always_on_top,
            commands::export_events,
            commands::webdav_probe,
            #[cfg(desktop)]
            commands::export_events_dialog,
            commands::export_snapshot_to,
            #[cfg(desktop)]
            commands::export_snapshot_dialog,
            commands::import_snapshot_check,
            commands::import_snapshot_from,
            #[cfg(desktop)]
            commands::import_snapshot_dialog,
            commands::q_data_location,
            commands::set_data_location_to,
            #[cfg(desktop)]
            commands::set_data_location_dialog,
            commands::reset_data_location,
            #[cfg(desktop)]
            sys::debug_window_visible,
            #[cfg(windows)]
            desktop_cmds::debug_focus_check
        ])
        .setup(|app| {
            let _ = fs::create_dir_all(LOG_DIR);
            log_line("[m2] Fermata dev 启动");

            // 数据库位置解析（优先级：环境变量 > 指针文件 > 默认 app_data_dir）；
            // 更名迁移（gika → Fermata）只在默认路径上发生一次
            let dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            if std::env::var("FERMATA_DB_PATH").is_err()
                && std::env::var("GIKA_DB_PATH").is_err()
                && !db::location::pointer_path(&dir).exists()
            {
                migrate_legacy_db(&dir);
            }
            let db_path = db::location::resolve(&dir);
            match db::open(&db_path) {
                Ok(conn) => {
                    log_line(&format!("[m2] db ready: {}", db_path.display()));
                    // 启动兜底：崩溃/强杀开口段按最后事件闭合；running 非休息则自动重开（gap 不计）
                    match db::ops::recover_after_restart(&conn, db::now_ms()) {
                        Ok(n) if n > 0 => log_line(&format!("[boot] 崩溃兜底：闭合 {n} 条开口段")),
                        Ok(_) => {}
                        Err(e) => log_line(&format!("[boot] recover FAILED: {e}")),
                    }
                    app.manage(db::DbPathState(std::sync::Mutex::new(db_path.clone())));
                    app.manage(db::DbState(std::sync::Mutex::new(conn)));
                }
                Err(e) => {
                    log_line(&format!("[m2] db open FAILED: {e}"));
                    return Err(e.into());
                }
            }

            #[cfg(desktop)]
            {
                sys::precreate_overlays(&app.handle())?;

                // 关主窗 = 退出整个应用：两个预建浮层是附属，无托盘的 v1 不留驻后台
                if let Some(main_win) = app.get_webview_window("main") {
                    let app_handle = app.handle().clone();
                    main_win.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { .. } = event {
                            app_handle.exit(0);
                        }
                    });
                }

                sys::spawn_idle_watchdog(app.handle().clone());

                // 热键与置顶从 settings 读
                let (combo, top) = {
                    let st = app.state::<db::DbState>();
                    let c = st.0.lock().map_err(|e| e.to_string())?;
                    (
                        db::ops::setting_get(&c, "hotkey").unwrap_or_else(|| "Alt+Q".into()),
                        db::ops::setting_get(&c, "always_on_top").unwrap_or_else(|| "0".into()),
                    )
                };
                log_line(&format!("[m2] hotkey from settings: {combo}"));
                match sys::apply_hotkey(&app.handle(), &combo) {
                    Ok(()) => log_line("[m2] hotkey registered"),
                    Err(e) => log_line(&format!("[m2] hotkey register FAILED: {e}")),
                }
                if top == "1" {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.set_always_on_top(true);
                    }
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building fermata")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // 优雅退出收尾：闭合全部开口段 + app_exit 事件（只来一次）
                use std::sync::atomic::{AtomicBool, Ordering};
                static DONE: AtomicBool = AtomicBool::new(false);
                if DONE.swap(true, Ordering::SeqCst) {
                    return;
                }
                let st = app_handle.state::<db::DbState>();
                let guard = st.0.lock().map_err(|e| e.to_string());
                if let Ok(c) = guard {
                    match db::ops::app_exit(&c, db::now_ms()) {
                        Ok(()) => log_line("[exit] app_exit：开口段已收口"),
                        Err(e) => log_line(&format!("[exit] app_exit FAILED: {e}")),
                    }
                }
            }
        });
}
