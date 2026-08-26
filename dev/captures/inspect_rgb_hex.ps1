$env:Path = "C:\Program Files\Wireshark;" + $env:Path
$PCAP = "E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\teclado_captura.pcapng"

Write-Output "=== INTERRUPT OUT a device 2 ep 0x03 (los posibles RGB) ==="
tshark -r $PCAP -Y 'usb.transfer_type == 0x01 and usb.endpoint_address == 0x03' -T fields -e frame.number -e frame.time_relative -e usb.src -e usb.dst -e usb.data_len -e usb.capdata 2>&1 | Select-Object -First 30

Write-Output "`n=== Mismo pero con todos los packets (no solo los primeros) ==="
$total = tshark -r $PCAP -Y 'usb.transfer_type == 0x01 and usb.endpoint_address == 0x03' 2>&1 | Measure-Object -Line
Write-Output "Total packets a ep 0x03 OUT: $($total.Lines)"

Write-Output "`n=== Primeros 10 contenidos en hex formateado ==="
tshark -r $PCAP -Y 'usb.transfer_type == 0x01 and usb.endpoint_address == 0x03' -T fields -e frame.number -e frame.time_relative -e usb.capdata 2>&1 | ForEach-Object {
    $parts = $_ -split "`t"
    $frame = $parts[0]
    $time = $parts[1]
    $hex_data = ($parts[2] -replace ':','').ToLower()
    if ($hex_data.Length -gt 0) {
        $formatted = ($hex_data -split '(.{2})' | Where-Object { $_ -ne '' }) -join ' '
        Write-Output "Frame $frame (t=$time) [len=$($hex_data.Length/2)]: $formatted"
    } else {
        Write-Output "Frame $frame (t=$time): empty"
    }
} | Select-Object -First 15

Write-Output "`n=== INTERRUPT IN desde ep 0x82 (audio IN?) ==="
tshark -r $PCAP -Y 'usb.transfer_type == 0x01 and usb.endpoint_address == 0x82' -T fields -e frame.number -e frame.time_relative -e usb.capdata 2>&1 | ForEach-Object {
    $parts = $_ -split "`t"
    $frame = $parts[0]
    $time = $parts[1]
    $hex_data = ($parts[2] -replace ':','').ToLower()
    if ($hex_data.Length -gt 0) {
        $formatted = ($hex_data -split '(.{2})' | Where-Object { $_ -ne '' }) -join ' '
        Write-Output "Frame $frame (t=$time) [len=$($hex_data.Length/2)]: $formatted"
    } else {
        Write-Output "Frame $frame (t=$time): empty"
    }
} | Select-Object -First 5

Write-Output "`n=== DESCRIPTORES del KX-500 en formato largo (hex completo) ==="
# Usar -V verbose para sacar los descriptores reales
tshark -r $PCAP -Y 'usb.control_stage == 3 and frame.number <= 18' -V 2>&1 | Select-String -Pattern "Descriptor|Data:" -Context 1,8 | Out-String -Width 4096
