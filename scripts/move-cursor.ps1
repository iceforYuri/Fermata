# Move cursor by 1px and back to register user activity (resets system idle timer)
Add-Type -AssemblyName System.Windows.Forms
$p = [System.Windows.Forms.Cursor]::Position
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(($p.X + 1), $p.Y)
Start-Sleep -Milliseconds 120
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($p.X, $p.Y)
Write-Output "cursor nudged"
