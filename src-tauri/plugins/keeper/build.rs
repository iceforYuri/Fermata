const COMMANDS: &[&str] = &["update", "schedule_reminder", "cancel_reminder", "register_listener"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .try_build()
        .unwrap();
}
