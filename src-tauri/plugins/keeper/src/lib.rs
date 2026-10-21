//! fermata-keeper：移动端会话通知 + 同步凭据 Keystore 封装（Android）。桌面端为空插件。
use tauri::{plugin::Builder, plugin::TauriPlugin};

#[cfg(target_os = "android")]
static HANDLE: std::sync::OnceLock<tauri::plugin::PluginHandle<tauri::Wry>> = std::sync::OnceLock::new();

pub fn init() -> TauriPlugin<tauri::Wry> {
    Builder::new("keeper")
        .setup(|_app, api| {
            #[cfg(target_os = "android")]
            {
                let handle = api.register_android_plugin("com.fermata.app.keeper", "KeeperPlugin")?;
                let _ = HANDLE.set(handle);
            }
            Ok(())
        })
        .build()
}

// ---- 同步凭据（docs/07 §5：Android Keystore；Rust 后台同步引擎经此直取，不绕 JS） ----

#[derive(serde::Deserialize)]
struct SecretResp {
    value: Option<String>,
}

#[cfg(target_os = "android")]
fn handle() -> Result<&'static tauri::plugin::PluginHandle<tauri::Wry>, String> {
    HANDLE.get().ok_or_else(|| "keeper 插件未初始化".to_string())
}

#[cfg(target_os = "android")]
pub fn secret_get() -> Result<Option<String>, String> {
    let r: SecretResp = handle()?
        .run_mobile_plugin("getSecret", ())
        .map_err(|e| format!("keystore 读失败: {e}"))?;
    Ok(r.value)
}

#[cfg(target_os = "android")]
pub fn secret_set(value: &str) -> Result<(), String> {
    handle()?
        .run_mobile_plugin::<serde_json::Value>("setSecret", serde_json::json!({ "value": value }))
        .map_err(|e| format!("keystore 写失败: {e}"))?;
    Ok(())
}

#[cfg(target_os = "android")]
pub fn secret_clear() -> Result<(), String> {
    handle()?
        .run_mobile_plugin::<serde_json::Value>("clearSecret", ())
        .map_err(|e| format!("keystore 清失败: {e}"))?;
    Ok(())
}

#[cfg(not(target_os = "android"))]
pub fn secret_get() -> Result<Option<String>, String> {
    Ok(None)
}
#[cfg(not(target_os = "android"))]
pub fn secret_set(_value: &str) -> Result<(), String> {
    Err("非 Android 平台".into())
}
#[cfg(not(target_os = "android"))]
pub fn secret_clear() -> Result<(), String> {
    Ok(())
}
