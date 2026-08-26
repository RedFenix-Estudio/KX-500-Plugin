#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Detecta todos los procesos y servicios relacionados al KX-500 en el sistema.
    Sirve para saber qué monitorear en API Monitor.
#>

$ErrorActionPreference = "Continue"

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "KX-500 procesos y servicios detectados" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Procesos user-mode conocidos del KX-500
$processNames = @(
    "CHECKPOINT_KX_500",
    "HidServ",
    "Mechanical Keyboard",
    "KX500",
    "Checkpoint",
    "HIDServ",
    "HclientDll"
)

Write-Host "[1] Procesos user-mode:" -ForegroundColor Yellow
Write-Host ""
$found = $false
foreach ($name in $processNames) {
    $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
    if ($procs) {
        foreach ($p in $procs) {
            $found = $true
            $path = ""
            try { $path = $p.MainModule.FileName } catch { $path = "(inaccesible)" }
            Write-Host "  ✅ PID $($p.Id)  Nombre: $($p.ProcessName).exe  Path: $path" -ForegroundColor Green
        }
    }
}
if (-not $found) {
    Write-Host "  ⚠️  Ninguno de los procesos user-mode conocidos esta corriendo" -ForegroundColor Red
    Write-Host "     Nombres buscados:" -ForegroundColor Gray
    foreach ($n in $processNames) { Write-Host "       - $n" -ForegroundColor Gray }
}

# 3. Servicios Windows
Write-Host ""
Write-Host "[2] Servicios Windows relacionados:" -ForegroundColor Yellow
Write-Host ""
$svcs = Get-Service | Where-Object { $_.Name -match "checkpoint|hidserv|hclient|keyboard|kx500" -or $_.DisplayName -match "checkpoint|kx500|keyboard" }
if ($svcs) {
    foreach ($s in $svcs) {
        $status = $s.Status.ToString()
        $color = if ($status -eq "Running") { "Green" } else { "Gray" }
        Write-Host "  Servicio: $($s.Name)  DisplayName: $($s.DisplayName)  Status: $status" -ForegroundColor $color
    }
} else {
    Write-Host "  (ningun servicio con nombre checkpoint/kx500/keyboard)" -ForegroundColor Gray
}

# 4. Drivers kernel-mode (.sys cargados)
Write-Host ""
Write-Host "[3] Drivers HID cargados:" -ForegroundColor Yellow
Write-Host ""
$drivers = driverquery /FO CSV /NH 2>&1 | ConvertFrom-Csv -ErrorAction SilentlyContinue
$kxDrivers = $drivers | Where-Object { $_.DisplayName -match "checkpoint|kx500|keyboard" -or $_.Driver -match "Checkpoint|Kx500" }
if ($kxDrivers) {
    foreach ($d in $kxDrivers) {
        Write-Host "  Driver: $($d.'Display Name')  Path: $($d.'Driver')  Type: $($d.'Driver Type')" -ForegroundColor Green
    }
} else {
    Write-Host "  (no se encontraron drivers con nombre checkpoint/kx500)" -ForegroundColor Gray
}

# 5. Buscar binarios en disco
Write-Host ""
Write-Host "[4] Binarios del KX-500 instalados en disco:" -ForegroundColor Yellow
Write-Host ""
$searchPaths = @(
    "C:\Program Files (x86)\CHECKPOINT KX-500",
    "C:\Program Files\CHECKPOINT KX-500",
    "C:\Windows\System32",
    "C:\Windows\SysWOW64"
)
foreach ($path in $searchPaths) {
    if (Test-Path $path) {
        Get-ChildItem $path -Recurse -Include "*.exe", "*.dll", "*.sys" -ErrorAction SilentlyContinue | Where-Object {
            $_.Name -match "checkpoint|kx500|hidserv|hclient"
        } | ForEach-Object {
            Write-Host "  $($_.FullName)  ($($_.Length) bytes)" -ForegroundColor Green
        }
    }
}

# 6. Si HidServ.exe esta corriendo como SYSTEM, hay que usar API Monitor con opcion especial
Write-Host ""
Write-Host "[5] Verificacion de sesion:" -ForegroundColor Yellow
Write-Host ""
$currentSession = (Get-Process -Id $PID).SessionId
Write-Host "  Tu PowerShell corre en sesion: $currentSession" -ForegroundColor Cyan
$systemProcs = Get-Process | Where-Object { $_.SessionId -eq 0 -and $_.ProcessName -match "CHECKPOINT|HidServ|KX500|Mechanical" }
if ($systemProcs) {
    Write-Host ""
    Write-Host "  ⚠️  Procesos KX-500 corriendo en sesion 0 (servicios):" -ForegroundColor Yellow
    foreach ($p in $systemProcs) {
        Write-Host "    PID $($p.Id)  $($p.ProcessName).exe  Sesion: $($p.SessionId)" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "  ESTO ES EL PROBLEMA:" -ForegroundColor Red
    Write-Host "  API Monitor no captura servicios en sesion 0 desde una sesion user-mode." -ForegroundColor Red
    Write-Host "" -ForegroundColor Red
    Write-Host "  Soluciones:" -ForegroundColor Green
    Write-Host "  1. Iniciar el driver oficial (CHECKPOINT_KX_500.exe) desde tu escritorio" -ForegroundColor White
    Write-Host "  2. O usar API Monitor con la opcion 'Inject into service' (Experimental)" -ForegroundColor White
}
else {
    Write-Host "  ✅ No hay procesos KX-500 en sesion 0" -ForegroundColor Green
    Write-Host "     Si HidServ esta corriendo, deberia aparecer en [1]" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Proximos pasos:" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "1. Si HidServ.exe esta corriendo como servicio (sesion 0):" -ForegroundColor White
Write-Host "   - Inicia CHECKPOINT_KX_500.exe manualmente (doble click)" -ForegroundColor White
Write-Host "   - O usa una de estas alternativas:" -ForegroundColor White
Write-Host ""
Write-Host "2. Alternativas al API Monitor:" -ForegroundColor White
Write-Host "   - **xperf** (built-in Windows) — captura USB a nivel kernel" -ForegroundColor White
Write-Host "   - **USBPcap + Wireshark** — el metodo original" -ForegroundColor White
Write-Host ""
Write-Host "3. Documentacion de cada metodo en:" -ForegroundColor White
Write-Host "   examples\CAPTURE-HID.md" -ForegroundColor White
Write-Host ""