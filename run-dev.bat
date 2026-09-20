@echo off
rem Fermata dev mode: clear port 14200 squatters, fix PATH, then tauri dev
set PATH=C:\Users\ice\.cargo\bin;E:\node.js\node_global;E:\node.js;%PATH%
cd /d F:\Code\20260917_gika
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":14200 " ^| findstr LISTENING') do taskkill /PID %%a /F 2>nul
taskkill /IM fermata.exe /F 2>nul
taskkill /IM gika.exe /F 2>nul
pnpm tauri dev
