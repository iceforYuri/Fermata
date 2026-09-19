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
    .title("gika 休止符")
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

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        log_line("[m2] hotkey fired");
                        gika_lib::sys::toggle_switcher(app);
                    }
                })
                .build(),
        )
        .manage(gika_lib::sys::SysState {
            time_scale: std::sync::Mutex::new(1.0),
            idling: std::sync::Mutex::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            poc_spawn_popup,
            gika_lib::commands::process_create,
            gika_lib::commands::process_switch,
            gika_lib::commands::process_complete,
            gika_lib::commands::process_reopen,
            gika_lib::commands::process_pause,
            gika_lib::commands::process_resume,
            gika_lib::commands::breakpoint_set,
            gika_lib::commands::entry_delete,
            gika_lib::commands::color_set,
            gika_lib::commands::waiting_ai_set,
            gika_lib::commands::step_add,
            gika_lib::commands::step_check,
            gika_lib::commands::steps_reorder,
            gika_lib::commands::queue_reorder,
            gika_lib::commands::plan_create,
            gika_lib::commands::plan_update,
            gika_lib::commands::plan_done,
            gika_lib::commands::plan_delete,
            gika_lib::commands::idle_start,
            gika_lib::commands::idle_end,
            gika_lib::commands::rest_trigger,
            gika_lib::commands::rest_choice,
            gika_lib::commands::rest_start,
            gika_lib::commands::rest_end,
            gika_lib::commands::slice_complete,
            gika_lib::commands::slice_aborted,
            gika_lib::commands::q_board,
            gika_lib::commands::q_process_day_total,
            gika_lib::commands::q_suspended_ms,
            gika_lib::commands::q_slice_stats,
            gika_lib::commands::q_continuous_work_ms,
            gika_lib::commands::q_events,
            gika_lib::commands::q_settings,
            gika_lib::commands::q_palette,
            gika_lib::commands::q_plans,
            gika_lib::commands::q_segments,
            gika_lib::commands::segment_note,
            gika_lib::commands::process_rename,
            gika_lib::commands::notes_set,
            gika_lib::commands::setting_set,
            gika_lib::commands::idle_confirm,
            gika_lib::commands::q_rest_state,
            gika_lib::commands::q_day_stats,
            gika_lib::commands::q_month_calendar,
            gika_lib::commands::q_year_overview,
            gika_lib::commands::q_day_view,
            gika_lib::commands::q_day_grid,
            gika_lib::commands::q_first_day,
            gika_lib::sys::summon,
            gika_lib::sys::conceal,
            gika_lib::sys::pin,
            gika_lib::sys::focus_main,
            gika_lib::sys::show_switcher,
            gika_lib::sys::hide_switcher,
            gika_lib::sys::show_restpop,
            gika_lib::sys::hide_restpop,
            gika_lib::sys::hotkey_apply,
            gika_lib::sys::debug_trigger_hotkey,
            gika_lib::sys::debug_set_time_scale,
            gika_lib::sys::debug_get_time_scale,
            gika_lib::sys::idle_current,
            gika_lib::sys::debug_always_on_top,
            gika_lib::commands::export_events,
            gika_lib::sys::debug_window_visible,
            debug_focus_check,
        ])
        .setup(|app| {
            let _ = fs::create_dir_all(LOG_DIR);
            log_line("[m2] gika dev 启动");

            let db_path = std::env::var("GIKA_DB_PATH")
                .map(std::path::PathBuf::from)
                .unwrap_or_else(|_| {
                    app.path()
                        .app_data_dir()
                        .unwrap_or_else(|_| std::path::PathBuf::from("."))
                        .join("gika.db")
                });
            match gika_lib::db::open(&db_path) {
                Ok(conn) => {
                    log_line(&format!("[m2] db ready: {}", db_path.display()));
                    app.manage(gika_lib::db::DbState(std::sync::Mutex::new(conn)));
                }
                Err(e) => {
                    log_line(&format!("[m2] db open FAILED: {e}"));
                    return Err(e.into());
                }
            }

            gika_lib::sys::precreate_overlays(&app.handle())?;

            gika_lib::sys::spawn_idle_watchdog(app.handle().clone());

            // 热键与置顶从 settings 读
            let (combo, top) = {
                let st = app.state::<gika_lib::db::DbState>();
                let c = st.0.lock().map_err(|e| e.to_string())?;
                (
                    gika_lib::db::ops::setting_get(&c, "hotkey").unwrap_or_else(|| "Alt+Q".into()),
                    gika_lib::db::ops::setting_get(&c, "always_on_top").unwrap_or_else(|| "0".into()),
                )
            };
            log_line(&format!("[m2] hotkey from settings: {combo}"));
            match gika_lib::sys::apply_hotkey(&app.handle(), &combo) {
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
        .expect("error while running gika");
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
