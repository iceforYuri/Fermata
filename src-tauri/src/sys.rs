//! 系统层命令：六原语（唤出/隐藏/置顶/焦点/空闲/热键）+ 预建浮层窗 + debug 替身。
//! 浮层全程 opaque 实心暖卡；switcher 要焦点，restpop 不抢焦点（PoC 原语A 路径）。

use std::sync::Mutex;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

use crate::db::{self, ops, DbState};

pub struct SysState {
    pub time_scale: Mutex<f64>,
    pub idling: Mutex<bool>,
}

fn get_window(app: &AppHandle, label: &str) -> Result<tauri::WebviewWindow, String> {
    app.get_webview_window(label)
        .ok_or_else(|| format!("窗口 {label} 未预建"))
}

fn show(app: &AppHandle, label: &str, focus: bool) -> Result<(), String> {
    let w = get_window(app, label)?;
    w.show().map_err(|e| e.to_string())?;
    if focus {
        let _ = w.set_focus();
    }
    let _ = app.emit("overlay-visibility", json!({ "label": label, "visible": true }));
    Ok(())
}

fn hide(app: &AppHandle, label: &str) -> Result<(), String> {
    let w = get_window(app, label)?;
    w.hide().map_err(|e| e.to_string())?;
    let _ = app.emit("overlay-visibility", json!({ "label": label, "visible": false }));
    Ok(())
}

/// 切换浮层开合：物理热键与 debug_trigger_hotkey 共用同一代码路径
pub fn toggle_switcher(app: &AppHandle) {
    let _ = app.emit("hotkey-fired", "switcher");
    if let Ok(w) = get_window(app, "switcher") {
        let visible = w.is_visible().unwrap_or(false);
        let r = if visible { hide(app, "switcher") } else { show(app, "switcher", true) };
        if let Err(e) = r {
            eprintln!("[m2] toggle_switcher: {e}");
        }
    }
}

// ---------- 六原语 ----------

#[tauri::command]
pub async fn summon(app: AppHandle) -> Result<(), String> {
    let w = get_window(&app, "main")?;
    w.unminimize().map_err(|e| e.to_string())?;
    show(&app, "main", true)
}

#[tauri::command]
pub async fn conceal(app: AppHandle) -> Result<(), String> {
    hide(&app, "main")
}

#[tauri::command]
pub async fn pin(app: AppHandle, state: State<'_, DbState>, on: bool) -> Result<(), String> {
    let w = get_window(&app, "main")?;
    w.set_always_on_top(on).map_err(|e| e.to_string())?;
    {
        let c = state.inner().0.lock().map_err(|e| e.to_string())?;
        ops::setting_set(&c, db::now_ms(), "always_on_top", if on { "1" } else { "0" })?;
    }
    let _ = app.emit("store-changed", ());
    Ok(())
}

#[tauri::command]
pub async fn focus_main(app: AppHandle) -> Result<(), String> {
    get_window(&app, "main")?.set_focus().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn show_switcher(app: AppHandle) -> Result<(), String> {
    show(&app, "switcher", true)
}

#[tauri::command]
pub async fn hide_switcher(app: AppHandle) -> Result<(), String> {
    hide(&app, "switcher")
}

/// 主屏工作区右下角（避开任务栏），卡片可视边距右/下各 16px（逻辑）。
/// 全链路物理像素：work_area 是物理值，卡尺寸 420×300 逻辑 ×scale，再折算无边框窗的隐形边。
#[tauri::command]
pub async fn show_restpop(app: AppHandle) -> Result<(), String> {
    if let Ok(w) = get_window(&app, "restpop") {
        let scale = w.scale_factor().unwrap_or(1.0);
        let card_w = (420.0 * scale).round() as i32;
        let card_h = (300.0 * scale).round() as i32;
        let margin = (16.0 * scale).round() as i32;
        // 无边框窗外框含 Windows 隐形 resize 边，按对称折算，让可视卡片贴住 16px 边距
        let outer = w
            .outer_size()
            .unwrap_or(tauri::PhysicalSize::new(card_w as u32, card_h as u32));
        let bx = (outer.width as i32 - card_w).max(0) / 2;
        let by = (outer.height as i32 - card_h).max(0) / 2;
        if let Ok(Some(m)) = w.primary_monitor() {
            let wa = m.work_area();
            let x = wa.position.x + wa.size.width as i32 - card_w - margin - bx;
            let y = wa.position.y + wa.size.height as i32 - card_h - margin - by;
            let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
        }
    }
    show(&app, "restpop", false) // 不抢焦点（WS_EX_NOACTIVATE）
}

#[tauri::command]
pub async fn hide_restpop(app: AppHandle) -> Result<(), String> {
    hide(&app, "restpop")
}

// ---------- 热键 ----------

fn parse_hotkey(s: &str) -> Option<Shortcut> {
    let mut mods = Modifiers::empty();
    let mut key: Option<Code> = None;
    for part in s.split('+').map(|p| p.trim()) {
        match part.to_ascii_lowercase().as_str() {
            "alt" => mods |= Modifiers::ALT,
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "shift" => mods |= Modifiers::SHIFT,
            "meta" | "win" | "super" => mods |= Modifiers::SUPER,
            k if k.len() == 1 => {
                let ch = k.chars().next().unwrap();
                key = Some(match ch {
                    'a'..='z' => match ch {
                        'a' => Code::KeyA, 'b' => Code::KeyB, 'c' => Code::KeyC,
                        'd' => Code::KeyD, 'e' => Code::KeyE, 'f' => Code::KeyF,
                        'g' => Code::KeyG, 'h' => Code::KeyH, 'i' => Code::KeyI,
                        'j' => Code::KeyJ, 'k' => Code::KeyK, 'l' => Code::KeyL,
                        'm' => Code::KeyM, 'n' => Code::KeyN, 'o' => Code::KeyO,
                        'p' => Code::KeyP, 'q' => Code::KeyQ, 'r' => Code::KeyR,
                        's' => Code::KeyS, 't' => Code::KeyT, 'u' => Code::KeyU,
                        'v' => Code::KeyV, 'w' => Code::KeyW, 'x' => Code::KeyX,
                        'y' => Code::KeyY, 'z' => Code::KeyZ,
                        _ => return None,
                    },
                    '0'..='9' => match ch {
                        '0' => Code::Digit0, '1' => Code::Digit1, '2' => Code::Digit2,
                        '3' => Code::Digit3, '4' => Code::Digit4, '5' => Code::Digit5,
                        '6' => Code::Digit6, '7' => Code::Digit7, '8' => Code::Digit8,
                        '9' => Code::Digit9,
                        _ => return None,
                    },
                    _ => return None,
                });
            }
            "space" => key = Some(Code::Space),
            "tab" => key = Some(Code::Tab),
            _ => return None,
        }
    }
    key.map(|k| Shortcut::new(Some(mods), k))
}

/// 从 settings.hotkey 重注册全局热键（改设置即生效）
pub fn apply_hotkey(app: &AppHandle, combo: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    match parse_hotkey(combo) {
        Some(sc) => gs
            .register(sc)
            .map_err(|e| format!("热键 {combo} 注册失败: {e}")),
        None => Err(format!("热键 {combo} 无法解析")),
    }
}

#[tauri::command]
pub async fn hotkey_apply(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    let combo = {
        let c = state.inner().0.lock().map_err(|e| e.to_string())?;
        ops::setting_get(&c, "hotkey").unwrap_or_else(|| "Alt+Q".into())
    };
    apply_hotkey(&app, &combo)
}

// ---------- debug 替身（验收用；本机合成输入不触发 RegisterHotKey，PoC 已留证） ----------

#[tauri::command]
pub async fn debug_trigger_hotkey(app: AppHandle) -> Result<(), String> {
    toggle_switcher(&app);
    Ok(())
}

#[tauri::command]
pub async fn debug_set_time_scale(
    app: AppHandle,
    sys: State<'_, SysState>,
    factor: f64,
) -> Result<f64, String> {
    let f = if factor <= 0.0 { 1.0 } else { factor };
    *sys.time_scale.lock().map_err(|e| e.to_string())? = f;
    let _ = app.emit("time-scale", f);
    Ok(f)
}

#[tauri::command]
pub async fn debug_get_time_scale(sys: State<'_, SysState>) -> Result<f64, String> {
    Ok(*sys.time_scale.lock().map_err(|e| e.to_string())?)
}

/// 当前空闲状态（页面挂载时对齐用；事件只有沿）
#[tauri::command]
pub async fn idle_current(sys: State<'_, SysState>) -> Result<bool, String> {
    Ok(*sys.idling.lock().map_err(|e| e.to_string())?)
}

// ---------- 预建浮层 ----------

pub fn precreate_overlays(app: &AppHandle) -> Result<(), String> {
    let switcher = WebviewWindowBuilder::new(
        app,
        "switcher",
        WebviewUrl::App("/?window=switcher#/overlay/switcher".into()),
    )
    .title("gika 切换")
    .inner_size(520.0, 320.0)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focusable(true)
    .visible(false)
    .resizable(false)
    .build()
    .map_err(|e| format!("预建 switcher 失败: {e}"))?;

    // 失焦自动收起
    let app2 = app.clone();
    switcher.on_window_event(move |event| {
        if let tauri::WindowEvent::Focused(false) = event {
            let _ = hide(&app2, "switcher");
        }
    });

    WebviewWindowBuilder::new(app, "restpop", WebviewUrl::App("/?window=restpop#/overlay/restpop".into()))
        .title("gika 休止符")
        .inner_size(420.0, 300.0)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focusable(false)
        .focused(false)
        .visible(false)
        .resizable(false)
        .build()
        .map_err(|e| format!("预建 restpop 失败: {e}"))?;
    Ok(())
}

/// 空闲看门狗：阈值每轮从 settings.idle_threshold_minutes 读（改设置即生效）；
/// GIKA_IDLE_SECS 环境变量优先（验收用）。
pub fn spawn_idle_watchdog(app: AppHandle) {
    std::thread::spawn(move || {
        let mut idling = false;
        loop {
            let threshold: u64 = std::env::var("GIKA_IDLE_SECS")
                .ok()
                .and_then(|s| s.parse().ok())
                .or_else(|| {
                    app.try_state::<DbState>().and_then(|st| {
                        st.0.lock()
                            .ok()
                            .and_then(|c| ops::setting_get(&c, "idle_threshold_minutes"))
                            .and_then(|v| v.parse::<u64>().ok())
                            .map(|m| m * 60)
                    })
                })
                .unwrap_or(300);
            if let Ok(secs) = user_idle::UserIdle::get_time().map(|u| u.as_seconds()) {
                if !idling && secs >= threshold {
                    idling = true;
                    if let Some(st) = app.try_state::<SysState>() {
                        if let Ok(mut g) = st.idling.lock() { *g = true; }
                    }
                    let _ = app.emit("gika-idle", true);
                } else if idling && secs < threshold {
                    idling = false;
                    if let Some(st) = app.try_state::<SysState>() {
                        if let Ok(mut g) = st.idling.lock() { *g = false; }
                    }
                    let _ = app.emit("gika-idle", false);
                }
            }
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
    });
}

/// 验收用：窗口可见性断言
#[tauri::command]
pub async fn debug_window_visible(app: AppHandle, label: String) -> Result<bool, String> {
    let w = get_window(&app, &label)?;
    w.is_visible().map_err(|e| e.to_string())
}

/// 验收用：主窗置顶状态断言
#[tauri::command]
pub async fn debug_always_on_top(app: AppHandle) -> Result<bool, String> {
    let w = get_window(&app, "main")?;
    w.is_always_on_top().map_err(|e| e.to_string())
}
