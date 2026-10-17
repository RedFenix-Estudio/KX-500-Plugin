# run_test.ps1
$ErrorActionPreference = 'Stop'
Set-Location 'E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\kx500-signalrgb-plugin\dev\tools'
$log = 'E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\kx500-signalrgb-plugin\dev\tools\test_v203_flow.log'
$env:PYTHONUNBUFFERED = '1'
& python test_v203_flow.py *> $log
Write-Host "Done."
Get-Content $log
