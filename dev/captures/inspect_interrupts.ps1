$env:Path = "C:\Program Files\Wireshark;" + $env:Path
$PCAP = "E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\teclado_captura.pcapng"

Write-Output "=== Setup packets (8 bytes) - contenido completo ==="
tshark -r $PCAP -Y 'usb.setup_flag == 1' -T fields -e frame.number -e frame.time_relative -e usb.device_address -e usb.endpoint_address -e usb.bmRequestType -e usb.bRequest -e usb.wValue -e usb.wIndex -e usb.wLength -e data.data 2>&1 | Select-Object -First 50

Write-Output "`n=== bmRequestType codes (top 10) ==="
tshark -r $PCAP -Y 'usb.setup_flag == 1' -T fields -e usb.bmRequestType 2>&1 | Sort-Object | Group-Object | Sort-Object -Property Count -Descending | Select-Object -First 10 | ForEach-Object { Write-Output "  bmReq=0x$($_.Name): $($_.Count) frames" }

Write-Output "`n=== bRequest codes (top 10) ==="
tshark -r $PCAP -Y 'usb.setup_flag == 1' -T fields -e usb.bRequest 2>&1 | Sort-Object | Group-Object | Sort-Object -Property Count -Descending | Select-Object -First 10 | ForEach-Object { Write-Output "  bReq=$($_.Name): $($_.Count) frames" }

Write-Output "`n=== wValue (top 15) ==="
tshark -r $PCAP -Y 'usb.setup_flag == 1' -T fields -e usb.wValue 2>&1 | Sort-Object | Group-Object | Sort-Object -Property Count -Descending | Select-Object -First 15 | ForEach-Object { Write-Output "  wValue=$($_.Name): $($_.Count) frames" }

Write-Output "`n=== Primeros 20 paquetes INTERRUPT (64 bytes) ==="
tshark -r $PCAP -Y 'usb.transfer_type == 0x01' -T fields -e frame.number -e frame.time_relative -e usb.src -e usb.dst -e usb.device_address -e usb.endpoint_address -e usb.data_len -e usb.capdata 2>&1 | Select-Object -First 20

Write-Output "`n=== Total de paquetes interrupt por (addr, ep) ==="
tshark -r $PCAP -Y 'usb.transfer_type == 0x01' -T fields -e usb.src -e usb.dst -e usb.device_address -e usb.endpoint_address 2>&1 | Group-Object | Sort-Object -Property Count -Descending | Select-Object -First 10 | ForEach-Object { Write-Output "  $($_.Name)" }
