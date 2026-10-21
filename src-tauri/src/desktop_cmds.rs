//! Windows 桌面专属：PoC/验收命令（原 main.rs 迁入，仅 Windows 编译）。

use std::fs;
use std::io::Write;
use std::time::Duration;

use serde_json::json;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowLongPtrW, GetWindowTextLengthW, GetWindowTextW, GWL_EXSTYLE,
    WS_EX_NOACTIVATE,
};

use crate::{log_line, LOG_DIR};

const FOCUS_LOG_PATH: &str = "../docs/screenshots/poc/focus-test.log";

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
pub async fn poc_spawn_popup(app: AppHandle) -> Result<serde_json::Value, String> {
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

/// 验收用：任意预建窗口的不抢焦点断言（PoC 原语A 的通用化）
#[tauri::command]
pub async fn debug_focus_check(label: String, app: AppHandle) -> Result<serde_json::Value, String> {
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
