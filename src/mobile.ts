/** 移动端判定：Tauri Android WebView 的 UA 含 Android；桌面窗口不存在该标记。 */
export const isMobile = /Android/i.test(navigator.userAgent);
