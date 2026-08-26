$env:Path = "C:\Program Files\Wireshark;" + $env:Path
$PCAP = "E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\teclado_captura.pcapng"

Write-Output "=== 1) TODOS los tipos de transferencia (no solo control) ==="
tshark -r $PCAP -T fields -e usb.transfer_type 2>&1 | Sort-Object | Get-Unique -AsString | ForEach-Object { Write-Output "  TT=0x$_" }

Write-Output "`n=== 2) Setup packets completos (8 bytes) con su contenido ==="
tshark -r $PCAP -Y 'usb.setup_flag == 1' -T fields -e frame.number -e frame.time_relative -e usb.device_address -e usb.endpoint_address -e usb.setup.bmRequestType -e usb.setup.bRequest -e usb.setup.wValue -e usb.setup.wIndex -e usb.setup.wLength -e usb.capdata 2>&1 | Select-Object -First 40

Write-Output "`n=== 3) Frames con data_len > 60 (descartamos setup/handshake) ==="
tshark -r $PCAP -Y 'usb.data_len > 60' -T fields -e frame.number -e frame.time_relative -e usb.src -e usb.dst -e usb.device_address -e usb.endpoint_address -e usb.transfer_type -e usb.data_len -e usb.capdata 2>&1 | Select-Object -First 20

Write-Output "`n=== 4) Frames con data_len > 100 ==="
tshark -r $PCAP -Y 'usb.data_len > 100' -T fields -e frame.number -e frame.time_relative -e usb.src -e usb.dst -e usb.device_address -e usb.endpoint_address -e usb.transfer_type -e usb.data_len -e usb.capdata 2>&1 | Select-Object -First 20

Write-Output "`n=== 5) Frames con data_len == 320 (RGB esperado) ==="
tshark -r $PCAP -Y 'usb.data_len == 320' -T fields -e frame.number -e frame.time_relative -e usb.src -e usb.dst -e usb.device_address -e usb.endpoint_address -e usb.transfer_type -e usb.data_len 2>&1 | Select-Object -First 5
$count320 = tshark -r $PCAP -Y 'usb.data_len == 320' 2>&1 | Measure-Object -Line
Write-Output "Total frames con data_len=320: $($count320.Lines)"

Write-Output "`n=== 6) Frames con data_len == 312 ==="
tshark -r $PCAP -Y 'usb.data_len == 312' 2>&1 | Measure-Object -Line | ForEach-Object { Write-Output "Total 312: $($_.Lines)" }

Write-Output "`n=== 7) Stats por device address ==="
tshark -r $PCAP -T fields -e usb.device_address 2>&1 | Sort-Object | Group-Object | ForEach-Object { Write-Output "  $($_.Name): $($_.Count) frames" }

Write-Output "`n=== 8) Stats por longitud de data_len (top 15) ==="
tshark -r $PCAP -T fields -e usb.data_len 2>&1 | Sort-Object -Property @{Expression={$_ -as [int]}} | Group-Object | Sort-Object -Property Count -Descending | Select-Object -First 15 | ForEach-Object { Write-Output "  len=$($_.Name): $($_.Count) frames" }
