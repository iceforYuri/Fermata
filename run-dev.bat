@echo off
rem Fermata dev mode helper.
rem 注意：tauri dev 会监听源文件、一变就重新编译并拉起窗口——这是开发看门狗，不用时请直接关窗/Ctrl+C。
rem 本脚本退出时自动清理应用与端口，不留驻后台。
set PATH=C:\Users\ice\.cargo\bin;E:\node.js\node_global;E:\node.js;%PATH%
cd /d F:\Code\20260917_gika

:clean
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":14200 " ^| findstr LISTENING') do taskkill /PID %%a /F 2>nul
taskkill /IM fermata.exe /F 2>nul

pnpm tauri dev

rem dev 退出后的自清：杀掉应用实例、释放端口
taskkill /IM fermata.exe /F 2>nul
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":14200 " ^| findstr LISTENING') do taskkill /PID %%a /F 2>nul
