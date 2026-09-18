#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};
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

/// 原语C · 空闲：user-idle 每秒轮询，阈值由 GIKA_IDLE_SECS 控制（默认 300）。
fn spawn_idle_watchdog() {
    let threshold: u64 = std::env::var("GIKA_IDLE_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(300);
    std::thread::spawn(move || {
        let mut resting = false;
        loop {
            if let Ok(secs) = user_idle::UserIdle::get_time().map(|u| u.as_seconds()) {
                if !resting && secs >= threshold {
                    resting = true;
                    log_line(&format!("[poc] idle begin (>={threshold}s)"));
                } else if resting && secs < threshold {
                    resting = false;
                    log_line("[poc] idle end");
                }
            }
            std::thread::sleep(Duration::from_secs(1));
        }
    });
}

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    log_line(&format!(
                        "[poc] hotkey event: shortcut={shortcut:?} state={:?}",
                        event.state
                    ));
                    if event.state == ShortcutState::Pressed {
                        let dbg = format!("{shortcut:?}");
                        if dbg.contains("ALT") && dbg.contains("KeyQ") {
                            log_line("[poc] hotkey alt+q fired");
                            let _ = app.emit("poc-hotkey", "alt+q");
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            poc_spawn_popup,
            gika_lib::commands::process_create,
            gika_lib::commands::process_switch,
            gika_lib::commands::process_complete,
            gika_lib::commands::process_reopen,
            gika_lib::commands::process_pause,
            gika_lib::commands::process_resume,
            gika_lib::commands::breakpoint_set,
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
        ])
        .setup(|app| {
            let _ = fs::create_dir_all(LOG_DIR);
            log_line("[poc] gika dev 启动");
            match app
                .global_shortcut()
                .register(Shortcut::new(Some(Modifiers::ALT), Code::KeyQ))
            {
                Ok(()) => log_line("[poc] hotkey alt+q registered"),
                Err(e) => log_line(&format!("[poc] hotkey alt+q register FAILED: {e}")),
            }
            spawn_idle_watchdog();

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
                    log_line(&format!("[m0] db ready: {}", db_path.display()));
                    app.manage(gika_lib::db::DbState(std::sync::Mutex::new(conn)));
                }
                Err(e) => {
                    log_line(&format!("[m0] db open FAILED: {e}"));
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running gika");
}
