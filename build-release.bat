@echo off
rem Fermata 一键出包：清端口与占用实例 → 全链路构建（前端内嵌可靠）→ 打印产物路径
set PATH=C:\Users\ice\.cargo\bin;E:\node.js\node_global;E:\node.js;%PATH%
cd /d F:\Code\20260917_gika
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":14200 " ^| findstr LISTENING') do taskkill /PID %%a /F 2>nul
taskkill /IM fermata.exe /F 2>nul
taskkill /IM gika.exe /F 2>nul
pnpm tauri build
echo.
echo ==== 绿色版: src-tauri\target\release\fermata.exe
echo ==== 安装包: src-tauri\target\release\bundle\nsis\
pause
