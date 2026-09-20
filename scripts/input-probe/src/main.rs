// 物理像素精确输入探针 v3
// 用法:
//   input-probe where            —— 打印 fermata 主窗矩形/客户区原点
//   input-probe topmost          —— fermata 主窗置顶（测试用）
//   input-probe x y [click]      —— DPI 精确移动（读回验证）+ 可选点击
use windows_sys::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
use windows_sys::Win32::UI::HiDpi::{PhysicalToLogicalPointForPerMonitorDPI, SetProcessDpiAwarenessContext};
use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
use windows_sys::Win32::UI::WindowsAndMessaging::*;
use windows_sys::Win32::Graphics::Gdi::ClientToScreen;

unsafe extern "system" fn enum_cb(hwnd: HWND, lp: LPARAM) -> i32 {
    let out = lp as *mut HWND;
    let mut title = [0u16; 64];
    let n = GetWindowTextW(hwnd, title.as_mut_ptr(), 64);
    if n > 0 && IsWindowVisible(hwnd) != 0 {
        let t = String::from_utf16_lossy(&title[..n as usize]);
        if t.contains("Fermata") {
            *out = hwnd;
            return 0;
        }
    }
    1
}

unsafe fn find_fermata() -> HWND {
    let mut found: HWND = std::ptr::null_mut();
    EnumWindows(Some(enum_cb), &mut found as *mut HWND as LPARAM);
    found
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    unsafe {
        SetProcessDpiAwarenessContext(std::mem::transmute(-4isize));
        match args.get(1).map(|s| s.as_str()) {
            Some("where") => {
                let h = find_fermata();
                let mut wr = RECT { left: 0, top: 0, right: 0, bottom: 0 };
                GetWindowRect(h, &mut wr);
                let mut o = POINT { x: 0, y: 0 };
                ClientToScreen(h, &mut o);
                println!("hwnd={:?} winRect={},{} clientOrigin={},{}", h, wr.left, wr.top, o.x, o.y);
            }
            Some("topmost") => {
                let h = find_fermata();
                // 先还原（最小化时 winRect=-32000）再置顶：SW_RESTORE=9；HWND_TOPMOST=-1, SWP_NOMOVE|NOSIZE=3
                ShowWindow(h, 9);
                std::thread::sleep(std::time::Duration::from_millis(300));
                SetWindowPos(h, std::mem::transmute(-1isize), 0, 0, 0, 0, 3);
                println!("topmost set");
            }
            _ => {
                let x: i32 = args[1].parse().unwrap();
                let y: i32 = args[2].parse().unwrap();
                let click = args.get(3).map(|s| s == "click").unwrap_or(false);
                SetCursorPos(x, y);
                std::thread::sleep(std::time::Duration::from_millis(60));
                let mut p = POINT { x: 0, y: 0 };
                GetCursorPos(&mut p);
                println!("actual=({},{})", p.x, p.y);
                if click {
                    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                    std::thread::sleep(std::time::Duration::from_millis(90));
                    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                }
            }
        }
    }
}
