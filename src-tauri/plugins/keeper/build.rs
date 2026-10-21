const COMMANDS: &[&str] = &["update", "schedule_reminder", "cancel_reminder", "register_listener", "hide", "set_secret", "get_secret", "clear_secret"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .try_build()
        .unwrap();
}
