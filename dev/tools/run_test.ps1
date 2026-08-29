# run_test.ps1
$ErrorActionPreference = 'Stop'
Set-Location 'E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\kx500-signalrgb-plugin\dev\tools'
$log = 'E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\kx500-signalrgb-plugin\dev\tools\test_exact_plugin.log'
$env:PYTHONUNBUFFERED = '1'
& python test_exact_plugin.py *> $log
Write-Host "Done."
Get-Content $log
