@echo off
setlocal EnableExtensions
rem Fermata Android release build: arm64 APK -> zip-align -> sign -> publish
rem Update VERSION with package.json / tauri.conf.json / Cargo.toml on every release.
set "VERSION=2.0.0"
set "ROOT=%~dp0"
cd /d "%ROOT%"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

if not defined JAVA_HOME set "JAVA_HOME=%LOCALAPPDATA%\Android\jdk17"
if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not defined NDK_HOME set "NDK_HOME=%ANDROID_HOME%\ndk\28.2.13676358"
if not defined FERMATA_ANDROID_KEYSTORE set "FERMATA_ANDROID_KEYSTORE=F:\Fermata-secrets\android-signing\fermata-release.jks"
if not defined FERMATA_ANDROID_KEYSTORE_PASS_FILE set "FERMATA_ANDROID_KEYSTORE_PASS_FILE=F:\Fermata-secrets\android-signing\keystore.txt"

if not exist "%FERMATA_ANDROID_KEYSTORE%" (
  echo [ERROR] Android keystore not found: %FERMATA_ANDROID_KEYSTORE%
  exit /b 1
)
if not exist "%FERMATA_ANDROID_KEYSTORE_PASS_FILE%" (
  echo [ERROR] keystore password file not found: %FERMATA_ANDROID_KEYSTORE_PASS_FILE%
  exit /b 1
)

set "BUILD_TOOLS="
for /f "delims=" %%d in ('dir /b /ad /o-n "%ANDROID_HOME%\build-tools" 2^>nul') do if not defined BUILD_TOOLS set "BUILD_TOOLS=%ANDROID_HOME%\build-tools\%%d"
if not defined BUILD_TOOLS (
  echo [ERROR] Android build-tools not found under %ANDROID_HOME%
  exit /b 1
)

set "STOREPASS="
for /f "tokens=2 delims==" %%p in ('findstr /b "storepass=" "%FERMATA_ANDROID_KEYSTORE_PASS_FILE%"') do set "STOREPASS=%%p"
set "ALIAS="
for /f "tokens=2 delims==" %%a in ('findstr /b "alias=" "%FERMATA_ANDROID_KEYSTORE_PASS_FILE%"') do set "ALIAS=%%a"
if not defined STOREPASS (
  echo [ERROR] storepass= missing in %FERMATA_ANDROID_KEYSTORE_PASS_FILE%
  exit /b 1
)
if not defined ALIAS set "ALIAS=fermata"

rem The Tauri frontend is embedded at Rust compile time; touch lib.rs so frontend-only changes are rebuilt.
powershell -NoProfile -Command "(Get-Item 'src-tauri\src\lib.rs').LastWriteTime = Get-Date"
if errorlevel 1 (
  echo [ERROR] failed to touch src-tauri\src\lib.rs
  exit /b 1
)

echo ==== Building Fermata %VERSION% Android arm64 ====
cargo tauri android build --target aarch64 --apk
if errorlevel 1 exit /b 1

set "UNSIGNED=%ROOT%src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"
set "ALIGNED=%TEMP%\Fermata-%VERSION%-arm64-aligned.apk"
set "OUT=%ROOT%publish\Fermata-%VERSION%-android-arm64.apk"
set "CHECKSUM=%ROOT%publish\Fermata-%VERSION%-android-arm64.sha256"
if not exist "%UNSIGNED%" (
  echo [ERROR] unsigned APK not found: %UNSIGNED%
  exit /b 1
)
if not exist "%ROOT%publish" mkdir "%ROOT%publish"

echo ==== Aligning ====
"%BUILD_TOOLS%\zipalign.exe" -p -f 4 "%UNSIGNED%" "%ALIGNED%"
if errorlevel 1 exit /b 1

echo ==== Signing ====
"%BUILD_TOOLS%\apksigner.bat" sign --ks "%FERMATA_ANDROID_KEYSTORE%" --ks-key-alias "%ALIAS%" --ks-pass "pass:%STOREPASS%" --key-pass "pass:%STOREPASS%" --out "%OUT%" "%ALIGNED%"
if errorlevel 1 exit /b 1

echo ==== Verifying ====
"%BUILD_TOOLS%\apksigner.bat" verify --verbose "%OUT%"
if errorlevel 1 exit /b 1

echo ==== Checksum ====
powershell -NoProfile -Command "$h=(Get-FileHash '%OUT%' -Algorithm SHA256).Hash; Set-Content '%CHECKSUM%' ($h + '  ' + [IO.Path]::GetFileName('%OUT%'))"
del /q "%ALIGNED%" 2>nul
echo.
echo APK: %OUT%
echo SHA256: %CHECKSUM%
endlocal
