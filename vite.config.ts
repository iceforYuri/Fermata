import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";

// 构建戳：git 短哈希 + 构建时间，设置页页脚展示，用于"这份 exe 是不是最新"的即时核对
let buildHash = "dev";
try {
  buildHash = execSync("git rev-parse --short HEAD").toString().trim();
} catch { /* 非 git 环境兜底 */ }

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace("T", " ")),
  },
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 14200,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
});
