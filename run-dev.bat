@echo off
rem gika 真机开发模式一键启动（本机 PATH 里 Tailscale 条目带引号，需前置补齐）
set PATH=C:\Users\ice\.cargo\bin;E:\node.js\node_global;E:\node.js;%PATH%
cd /d F:\Code\20260917_gika
pnpm tauri dev
