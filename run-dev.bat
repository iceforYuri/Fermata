@echo off
rem Fermata preview runner: full build (tsc + vite build + cargo) then launch the embedded binary.
rem No vite server, no file watcher, NO hot reload -- the window only changes when you rerun this script.
rem For hot-reload development use: pnpm tauri dev (see D53/D59 in docs/deviation.md).
set PATH=C:\Users\ice\.cargo\bin;E:\node.js\node_global;E:\node.js;%PATH%
cd /d F:\Code\20260917_gika

rem close any previous instance (same process name as the installed build; state lives in the DB, closing is harmless)
taskkill /IM fermata.exe /F 2>nul

echo [run-dev] building frontend (tsc + vite build)...
call pnpm build
if errorlevel 1 (
  echo [run-dev] frontend build FAILED, aborting.
  exit /b 1
)

echo [run-dev] building app binary (cargo, re-embeds dist)...
call cargo build --manifest-path src-tauri\Cargo.toml
if errorlevel 1 (
  echo [run-dev] cargo build FAILED, aborting.
  exit /b 1
)

echo [run-dev] launching preview...
start "" src-tauri\target\debug\fermata.exe
