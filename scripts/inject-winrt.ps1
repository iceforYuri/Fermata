# Inject Ctrl+Alt+Shift+O via WinRT InputInjector (PS5.1 needs ContentType=WindowsRuntime qualified names)
$InjectorType = [Windows.UI.Input.Preview.Injection.InputInjector, Windows.UI.Input.Preview.Injection, ContentType=WindowsRuntime]
$KeyInfoType = [Windows.UI.Input.Preview.Injection.InjectedInputKeyboardInfo, Windows.UI.Input.Preview.Injection, ContentType=WindowsRuntime]
$KeyOptType = [Windows.UI.Input.Preview.Injection.InjectedInputKeyOptions, Windows.UI.Input.Preview.Injection, ContentType=WindowsRuntime]
$injector = $InjectorType::TryCreate()
if ($null -eq $injector) { Write-Output "InputInjector unavailable"; exit 1 }
function New-Key($vk, $down) {
  $k = New-Object $KeyInfoType
  $k.VirtualKey = $vk
  $k.KeyOptions = if ($down) { $KeyOptType::None } else { $KeyOptType::KeyUp }
  return $k
}
$seq = @(
  (New-Key 162 $true),   # LCONTROL
  (New-Key 164 $true),   # LMENU (Alt)
  (New-Key 160 $true),   # LSHIFT
  (New-Key 0x4F $true),  # O
  (New-Key 0x4F $false),
  (New-Key 160 $false),
  (New-Key 164 $false),
  (New-Key 162 $false)
)
$listType = [System.Collections.Generic.List`1].MakeGenericType($KeyInfoType)
$list = [Activator]::CreateInstance($listType)
foreach ($k in $seq) { $list.Add($k) }
$injector.InjectKeyboardInput($list)
Write-Output "InputInjector sent Ctrl+Alt+Shift+O"
