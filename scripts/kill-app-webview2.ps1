# 清杀本应用（com.fermata.app / com.gika.dev / m2-udf）名下的 WebView2 僵尸进程树
$procs = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'"
$ours = @()
foreach ($p in $procs) {
  if ($p.CommandLine -match 'com\.fermata\.app|com\.gika\.dev|m2-udf|20260917_gika') { $ours += $p }
}
# 浏览器根进程（无 --type= 参数）
$roots = $ours | Where-Object { $_.CommandLine -notmatch '--type=' }
foreach ($r in $roots) {
  Write-Output ("kill browser root PID=" + $r.ProcessId)
  Stop-Process -Id $r.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Milliseconds 800
# 残余（根死后的孤儿）
$left = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -match 'com\.fermata\.app|com\.gika\.dev|m2-udf|20260917_gika' }
foreach ($p in $left) {
  Write-Output ("kill leftover PID=" + $p.ProcessId)
  Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
}
Write-Output ("done. ours=" + $ours.Count)
