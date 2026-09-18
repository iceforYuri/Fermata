$w = New-Object -ComObject wscript.shell
$ok = $w.AppActivate("gika")
Write-Output "AppActivate(gika) = $ok"
Start-Sleep -Milliseconds 600
$w.SendKeys("%q")
Start-Sleep -Milliseconds 300
Write-Output "SendKeys %q done"
