#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::json;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::ShortcutState;
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW, GWL_EXSTYLE,
    WS_EX_NOACTIVATE,
};

const LOG_DIR: &str = "../docs/screenshots/poc";
const LOG_PATH: &str = "../docs/screenshots/poc/poc-runtime.log";
const FOCUS_LOG_PATH: &str = "../docs/screenshots/poc/focus-test.log";

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn log_line(msg: &str) {
    println!("{msg}");
    let _ = fs::create_dir_all(LOG_DIR);
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(LOG_PATH) {
        let _ = writeln!(f, "[{}] {msg}", now_ms());
    }
}

unsafe fn window_title(hwnd: HWND) -> String {
    let len = GetWindowTextLengthW(hwnd);
    if len <= 0 {
        return String::new();
    }
    let mut buf = vec![0u16; (len + 1) as usize];
    let n = GetWindowTextW(hwnd, buf.as_mut_ptr(), len + 1);
    String::from_utf16_lossy(&buf[..n.max(0) as usize])
}

/// 原语A：创建不抢焦点的休止符小样弹窗，并断言前台窗口不变 + 弹窗含 WS_EX_NOACTIVATE。
#[tauri::command]
async fn poc_spawn_popup(app: AppHandle) -> Result<serde_json::Value, String> {
    let mut log: Vec<String> = Vec::new();
    if let Some(existing) = app.get_webview_window("poc-popup") {
        let _ = existing.close();
        std::thread::sleep(Duration::from_millis(150));
    }

    let (before_hwnd, before_title) = unsafe {
        let h = GetForegroundWindow();
        (h as isize, window_title(h))
    };
    log.push(format!("前台窗口（创建前）: hwnd=0x{before_hwnd:x} 标题={before_title:?}"));

    let popup = WebviewWindowBuilder::new(
        &app,
        "poc-popup",
        WebviewUrl::App("/#/overlay/poc-popup".into()),
    )
    .title("Fermata 休止符")
    .inner_size(420.0, 280.0)
    .decorations(false)
    .always_on_top(true)
    .focusable(false)
    .focused(false)
    .skip_taskbar(true)
    .resizable(false)
    .build()
    .map_err(|e| e.to_string())?;

    std::thread::sleep(Duration::from_millis(400));

    let (after_hwnd, after_title) = unsafe {
        let h = GetForegroundWindow();
        (h as isize, window_title(h))
    };
    log.push(format!("前台窗口（创建后）: hwnd=0x{after_hwnd:x} 标题={after_title:?}"));

    let popup_raw: isize = popup.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let ex_style = unsafe { GetWindowLongPtrW(popup_raw as HWND, GWL_EXSTYLE) };
    let has_no_activate = (ex_style as u32 & WS_EX_NOACTIVATE) != 0;
    let foreground_unchanged = before_hwnd == after_hwnd;
    let pass = foreground_unchanged && has_no_activate;

    log.push(format!("弹窗 GWL_EXSTYLE = 0x{ex_style:08x}"));
    log.push(format!(
        "WS_EX_NOACTIVATE (0x08000000): {}",
        if has_no_activate { "含" } else { "不含" }
    ));
    log.push(format!(
        "前台未易主: {}",
        if foreground_unchanged { "是" } else { "否" }
    ));
    log.push(format!("[poc] focus-test {}", if pass { "PASS" } else { "FAIL" }));
    for l in &log {
        log_line(l);
    }
    let _ = fs::create_dir_all(LOG_DIR);
    if let Ok(mut f) = fs::File::create(FOCUS_LOG_PATH) {
        let _ = writeln!(f, "{}", log.join("\n"));
    }

    Ok(json!({
        "beforeHwnd": format!("0x{before_hwnd:x}"),
        "beforeTitle": before_title,
        "afterHwnd": format!("0x{after_hwnd:x}"),
        "afterTitle": after_title,
        "exStyle": format!("0x{ex_style:08x}"),
        "hasNoActivate": has_no_activate,
        "foregroundUnchanged": foreground_unchanged,
        "pass": pass,
        "log": log,
    }))
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

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        log_line("[m2] hotkey fired");
                        fermata_lib::sys::toggle_switcher(app);
                    }
                })
                .build(),
        )
        .manage(fermata_lib::sys::SysState {
            time_scale: std::sync::Mutex::new(1.0),
            idling: std::sync::Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            poc_spawn_popup,
            fermata_lib::commands::process_create,
            fermata_lib::commands::process_switch,
            fermata_lib::commands::process_complete,
            fermata_lib::commands::process_reopen,
            fermata_lib::commands::process_pause,
            fermata_lib::commands::process_resume,
            fermata_lib::commands::breakpoint_set,
            fermata_lib::commands::entry_delete,
            fermata_lib::commands::color_set,
            fermata_lib::commands::waiting_ai_set,
            fermata_lib::commands::step_add,
            fermata_lib::commands::step_check,
            fermata_lib::commands::steps_reorder,
            fermata_lib::commands::queue_reorder,
            fermata_lib::commands::plan_create,
            fermata_lib::commands::plan_update,
            fermata_lib::commands::plan_done,
            fermata_lib::commands::plan_delete,
            fermata_lib::commands::idle_start,
            fermata_lib::commands::idle_end,
            fermata_lib::commands::rest_trigger,
            fermata_lib::commands::rest_choice,
            fermata_lib::commands::rest_start,
            fermata_lib::commands::rest_end,
            fermata_lib::commands::slice_complete,
            fermata_lib::commands::slice_aborted,
            fermata_lib::commands::slice_override,
            fermata_lib::commands::q_board,
            fermata_lib::commands::q_process_day_total,
            fermata_lib::commands::q_suspended_ms,
            fermata_lib::commands::q_slice_stats,
            fermata_lib::commands::q_continuous_work_ms,
            fermata_lib::commands::q_events,
            fermata_lib::commands::q_settings,
            fermata_lib::commands::q_palette,
            fermata_lib::commands::q_plans,
            fermata_lib::commands::q_segments,
            fermata_lib::commands::segment_note,
            fermata_lib::commands::process_rename,
            fermata_lib::commands::notes_set,
            fermata_lib::commands::setting_set,
            fermata_lib::commands::idle_confirm,
            fermata_lib::commands::q_rest_state,
            fermata_lib::commands::q_day_stats,
            fermata_lib::commands::q_month_calendar,
            fermata_lib::commands::q_year_overview,
            fermata_lib::commands::q_day_view,
            fermata_lib::commands::q_day_grid,
            fermata_lib::commands::q_first_day,
            fermata_lib::sys::summon,
            fermata_lib::sys::conceal,
            fermata_lib::sys::pin,
            fermata_lib::sys::focus_main,
            fermata_lib::sys::show_switcher,
            fermata_lib::sys::hide_switcher,
            fermata_lib::sys::show_restpop,
            fermata_lib::sys::hide_restpop,
            fermata_lib::sys::hotkey_apply,
            fermata_lib::sys::debug_trigger_hotkey,
            fermata_lib::sys::debug_set_time_scale,
            fermata_lib::sys::debug_get_time_scale,
            fermata_lib::sys::idle_current,
            fermata_lib::sys::debug_always_on_top,
            fermata_lib::commands::export_events,
            fermata_lib::sys::debug_window_visible,
            debug_focus_check,
        ])
        .setup(|app| {
            let _ = fs::create_dir_all(LOG_DIR);
            log_line("[m2] Fermata dev 启动");

            // 更名迁移（gika → Fermata）：环境变量优先（FERMATA_DB_PATH，兼容旧 GIKA_DB_PATH）；
            // 默认路径下若旧 com.gika.dev 库在而新库不在 → 复制（不移动）旧库到新目录
            let db_path = std::env::var("FERMATA_DB_PATH")
                .or_else(|_| std::env::var("GIKA_DB_PATH"))
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| {
                    let dir = app
                        .path()
                        .app_data_dir()
                        .unwrap_or_else(|_| std::path::PathBuf::from("."));
                    migrate_legacy_db(&dir);
                    dir.join("fermata.db")
                });
            match fermata_lib::db::open(&db_path) {
                Ok(conn) => {
                    log_line(&format!("[m2] db ready: {}", db_path.display()));
                    app.manage(fermata_lib::db::DbState(std::sync::Mutex::new(conn)));
                }
                Err(e) => {
                    log_line(&format!("[m2] db open FAILED: {e}"));
                    return Err(e.into());
                }
            }

            fermata_lib::sys::precreate_overlays(&app.handle())?;

            fermata_lib::sys::spawn_idle_watchdog(app.handle().clone());

            // 热键与置顶从 settings 读
            let (combo, top) = {
                let st = app.state::<fermata_lib::db::DbState>();
                let c = st.0.lock().map_err(|e| e.to_string())?;
                (
                    fermata_lib::db::ops::setting_get(&c, "hotkey").unwrap_or_else(|| "Alt+Q".into()),
                    fermata_lib::db::ops::setting_get(&c, "always_on_top").unwrap_or_else(|| "0".into()),
                )
            };
            log_line(&format!("[m2] hotkey from settings: {combo}"));
            match fermata_lib::sys::apply_hotkey(&app.handle(), &combo) {
                Ok(()) => log_line("[m2] hotkey registered"),
                Err(e) => log_line(&format!("[m2] hotkey register FAILED: {e}")),
            }
            if top == "1" {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.set_always_on_top(true);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running fermata");
}

/// 验收用：任意预建窗口的不抢焦点断言（PoC 原语A 的通用化）
#[tauri::command]
async fn debug_focus_check(label: String, app: AppHandle) -> Result<serde_json::Value, String> {
    let before = unsafe { GetForegroundWindow() };
    let w = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("窗口 {label} 不存在"))?;
    w.show().map_err(|e| e.to_string())?;
    std::thread::sleep(Duration::from_millis(400));
    let after = unsafe { GetForegroundWindow() };
    let hwnd: isize = w.hwnd().map_err(|e| e.to_string())?.0 as isize;
    let ex_style = unsafe { GetWindowLongPtrW(hwnd as HWND, GWL_EXSTYLE) };
    let has_no_activate = (ex_style as u32 & WS_EX_NOACTIVATE) != 0;
    let unchanged = before == after;
    Ok(json!({
        "label": label,
        "foregroundUnchanged": unchanged,
        "hasNoActivate": has_no_activate,
        "pass": unchanged && has_no_activate,
    }))
}
