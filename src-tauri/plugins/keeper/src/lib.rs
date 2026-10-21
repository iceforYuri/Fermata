//! fermata-keeper：移动端会话通知（Android）。桌面端为空插件。
use tauri::{plugin::Builder, plugin::TauriPlugin, Runtime};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("keeper")
        .setup(|_app, api| {
            #[cfg(target_os = "android")]
            api.register_android_plugin("com.fermata.app.keeper", "KeeperPlugin")?;
            Ok(())
        })
        .build()
}
