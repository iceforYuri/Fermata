$since = (Get-Date).AddMinutes(-30)
$logs = @('Application', 'System')
foreach ($log in $logs) {
  $ev = Get-WinEvent -FilterHashtable @{ LogName = $log } -MaxEvents 3000 -ErrorAction SilentlyContinue |
    Where-Object { $_.TimeCreated -gt $since -and ($_.Message -match 'fermata' -or $_.Message -match 'WebView2' -or $_.Message -match 'msedge') } |
    Select-Object -First 6
  foreach ($e in $ev) {
    Write-Output ("== [" + $log + "] " + $e.TimeCreated + " " + $e.LevelDisplayName + " " + $e.ProviderName)
    Write-Output ($e.Message.Substring(0, [Math]::Min(300, $e.Message.Length)))
  }
}
Write-Output "scan done"
