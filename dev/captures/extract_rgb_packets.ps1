$env:Path = "C:\Program Files\Wireshark;" + $env:Path
$PCAP = "E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\teclado_captura.pcapng"

Write-Output "=== TODOS los HID Data UNICOS (sin padding trailing zeros) ==="
$allData = tshark -r $PCAP -Y 'usb.transfer_type == 0x01 and usb.endpoint_address == 0x03' -T fields -e usbhid.data 2>&1 | Where-Object { $_ -ne '' }

$unique = @{}
foreach ($line in $allData) {
    $clean = ($line -replace ':','').ToLower()
    if ($clean.Length -eq 0) { continue }
    # Trim trailing 00 bytes
    $trimmed = $clean -replace '00+$', ''
    if ($trimmed.Length -eq 0) { $trimmed = '00' }
    $formatted = ($trimmed -split '(.{2})' | Where-Object { $_ -ne '' }) -join ' '
    if (-not $unique.ContainsKey($formatted)) {
        $unique[$formatted] = 0
    }
    $unique[$formatted]++
}

Write-Output "Total paquetes: $($allData.Count)"
Write-Output "Total HID Data UNICOS (trimmed): $($unique.Count)"
Write-Output ""
Write-Output "Reporte por comando (primer byte después de Report ID 0x04):"

# Agrupar por comando (byte 1)
$byCmd = @{}
foreach ($key in $unique.Keys) {
    $bytes = ($key -split ' ')
    if ($bytes[0] -eq '04' -and $bytes.Count -ge 2) {
        $cmd = $bytes[1]
        if (-not $byCmd.ContainsKey($cmd)) { $byCmd[$cmd] = @() }
        $byCmd[$cmd] += @{ data = $key; count = $unique[$key] }
    }
}

foreach ($cmd in ($byCmd.Keys | Sort-Object)) {
    $items = $byCmd[$cmd]
    Write-Output ""
    Write-Output "--- Comando 0x$cmd ($($items.Count) variantes, $(($items | Measure-Object -Property count -Sum).Sum) paquetes totales) ---"
    foreach ($item in $items) {
        Write-Output "  [$($item.count)x] $($item.data)"
    }
}

Write-Output ""
Write-Output "=== Secuencia temporal de los primeros 30 paquetes RGB (todos los bytes) ==="
tshark -r $PCAP -Y 'usb.transfer_type == 0x01 and usb.endpoint_address == 0x03' -T fields -e frame.number -e frame.time_relative -e usbhid.data 2>&1 | Select-Object -First 30 | ForEach-Object {
    $parts = $_ -split "`t"
    $frame = $parts[0]
    $time = $parts[1]
    $data = ($parts[2] -replace ':','').ToLower()
    if ($data.Length -gt 0) {
        $trimmed = $data -replace '00+$', ''
        if ($trimmed.Length -eq 0) { $trimmed = '00' }
        $formatted = ($trimmed -split '(.{2})' | Where-Object { $_ -ne '' }) -join ' '
        Write-Output "[$frame @ ${time}s]: $formatted"
    }
}
