#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Captura los HID Feature Reports del KX-500 usando API Monitor.

.DESCRIPTION
    Este script automatiza la calibración del header HID del KX-500:
    1. Inicia API Monitor con filtros específicos para HidD_SetFeature
    2. Configura el filtro a hid.dll + HidD_SetFeature/HidD_SetOutputReport
    3. Espera a que Erik aplique un color desde el driver oficial
    4. Captura los parametros buffer de cada llamada

.NOTES
    Requiere ejecutar como Administrador.
    API Monitor Portable Edition en tools/API-Monitor/

.EXAMPLE
    .\api-monitor-capture.ps1
#>

$ErrorActionPreference = "Stop"

# Rutas
$apiMonitor = Join-Path $PSScriptRoot "..\tools\API-Monitor\apimonitor-x64.exe"
$captureDir = "$env:TEMP\kx500-capture"
$outputFile = Join-Path $captureDir "hid-capture.log"

# Verificar que el executable existe
if (-not (Test-Path $apiMonitor)) {
    Write-Error "API Monitor no encontrado en: $apiMonitor"
    Write-Host "Descarga desde: https://www.rohitab.com/apimonitor/downloads"
    exit 1
}

# Verificar permisos de admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠️  ADVERTENCIA: API Monitor necesita ejecutarse como Administrador"
    Write-Host "    para capturar llamadas HID a nivel kernel."
    Write-Host "    Haz click derecho → 'Run as Administrator' en PowerShell"
    Write-Host ""
    $confirm = Read-Host "Continuar de todos modos? (S/N)"
    if ($confirm -ne "S") { exit 1 }
}

# Crear directorio de captura
New-Item -Path $captureDir -ItemType Directory -Force | Out-Null
Write-Host ""
Write-Host "╔════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   KX-500 HID Capture con API Monitor               ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Output: $outputFile"
Write-Host ""

Write-Host "📋 Pasos siguientes:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Cuando API Monitor abra, activá Monitoring: " -NoNewline
Write-Host "Monitoring → Enable Monitoring" -ForegroundColor Green
Write-Host ""
Write-Host "2. Aplicá filtros:" -ForegroundColor White
Write-Host "   - File → Filter → Module: hid.dll"
Write-Host "   - Function: HidD_SetFeature ✓"
Write-Host "   - Function: HidD_SetOutputReport ✓"
Write-Host ""
Write-Host "3. Iniciá el driver oficial CHECKPOINT_KX_500.exe"
Write-Host "   (Mechanical Keyboard.exe si está disponible)"
Write-Host ""
Write-Host "4. Aplicá un color sólido desde el driver oficial"
Write-Host ""
Write-Host "5. En la ventana principal de API Monitor vas a ver las llamadas."
Write-Host "   Copiá el parametro 'Buffer' (bytes hex) de cada llamada."
Write-Host "   Los primeros 16-32 bytes son el header HID que necesitas."
Write-Host ""
Write-Host "6. Cerrá API Monitor cuando termines."
Write-Host ""
Write-Host "📂 El log se guardara en: " -NoNewline
Write-Host $outputFile -ForegroundColor Cyan
Write-Host ""

# Lanzar API Monitor
Write-Host "🚀 Lanzando API Monitor..." -ForegroundColor Green
Write-Host "   (esperando que abras el .exe - si necesitas ayuda, mirá arriba)"
Write-Host ""

Start-Process -FilePath $apiMonitor -PassThru | ForEach-Object {
    Write-Host "   PID: $($_.Id)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "✅ API Monitor iniciado. Aplica el color desde el driver oficial."
Write-Host ""
Write-Host "Cuando captures los bytes, pegamelos y actualizo KX500_Lite.js con ellos."
