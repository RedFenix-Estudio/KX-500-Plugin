$env:Path = "C:\Program Files\Wireshark;" + $env:Path
$PCAP = "E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\teclado_captura.pcapng"

# Solo OUT (host -> device) — los feature reports van aca
Write-Output "=== OUT frames (host -> device) ==="
tshark -r $PCAP -Y 'usb.src == "host"' -T fields -e frame.number -e frame.time_relative -e usb.transfer_type -e usb.endpoint_address -e usb.data_len -e usb.capdata 2>&1 | Select-Object -First 30

Write-Output "`n=== ALL frames, sin filtro (solo primeros 20) ==="
tshark -r $PCAP -T fields -e frame.number -e frame.time_relative -e usb.src -e usb.dst -e usb.transfer_type -e usb.endpoint_address -e usb.data_len -e usb.capdata 2>&1 | Select-Object -First 20

Write-Output "`n=== Stats de endpoints y transfer types ==="
tshark -r $PCAP -z io,phs -q 2>&1 | Select-String -Pattern "USB|endpoint" -Context 0,5 | Select-Object -First 40
