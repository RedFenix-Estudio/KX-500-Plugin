$env:Path = "C:\Program Files\Wireshark;" + $env:Path
$PCAP = "E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\teclado_captura.pcapng"

Write-Output "=== Respuestas a GET_DESCRIPTOR (control_stage=3 Data) - completas ==="
tshark -r $PCAP -Y 'usb.control_stage == 3' -T fields -e frame.number -e usb.src -e usb.dst -e usb.device_address -e usb.endpoint_address -e usb.data_len -e data.data 2>&1 | Select-Object -First 20

Write-Output "`n=== DESCRIPTOR del KX-500 - todos los responses en hex (formato largo) ==="
tshark -r $PCAP -Y 'usb.control_stage == 3' -T fields -e frame.number -e usb.device_address -e data.data 2>&1 | ForEach-Object {
    $parts = $_ -split "`t"
    if ($parts.Count -ge 3) {
        $frame = $parts[0]
        $addr = $parts[1]
        $data = $parts[2] -replace ':',''
        if ($data.Length -gt 0 -and $data.Length -lt 200) {
            $hex = ($data -split '(.{2})' | Where-Object { $_ -ne '' }) -join ' '
            Write-Output "[Frame $frame / addr $addr / $($data.Length/2) bytes]: $hex"
        } else {
            Write-Output "[Frame $frame / addr $addr]: (empty or too large)"
        }
    }
} | Select-Object -First 25

Write-Output "`n=== Devices distintos vistos (addr x endpoint x transfer_type x data_len) ==="
tshark -r $PCAP -T fields -e usb.device_address -e usb.endpoint_address -e usb.transfer_type 2>&1 | Sort-Object -Unique | ForEach-Object { Write-Output "  $_" }

Write-Output "`n=== Buscar si existe device 4 o 5 ==="
tshark -r $PCAP -T fields -e usb.device_address 2>&1 | Sort-Object -Unique
