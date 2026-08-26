$env:Path = "C:\Program Files\Wireshark;" + $env:Path
$PCAP = "E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\teclado_captura.pcapng"

Write-Output "=== Paquetes Interrupt OUT a 0x03 con -x (raw hex) ==="
tshark -r $PCAP -Y 'frame.number == 1041' -x 2>&1 | Out-String -Width 4096

Write-Output "`n=== Primeros 30 paquetes RGB en hex formateado (paquete completo) ==="
tshark -r $PCAP -Y 'usb.transfer_type == 0x01 and usb.endpoint_address == 0x03' -x 2>&1 | ForEach-Object {
    if ($_ -match '^\s*([0-9a-fA-F]{4}):\s+((?:[0-9a-fA-F]{2}\s+){1,16})') {
        $offset = $Matches[1]
        $bytes = ($Matches[2] -replace '\s+', ' ').Trim() -split ' '
        if ($offset -eq '0000') {
            Write-Output "[Frame starting at 0x$offset]: $($bytes -join ' ')"
        }
    }
} | Select-Object -First 30

Write-Output "`n=== Primeros 10 packets completos via tshark -V ==="
tshark -r $PCAP -Y 'frame.number == 1041 or frame.number == 1045 or frame.number == 1049' -V 2>&1 | Out-String -Width 4096
