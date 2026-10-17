# -*- coding: utf-8 -*-
"""
parse_pcapng_usb.py
===================
Parser de pcapng minimo (sin tshark) para extraer los paquetes USBPcap.

Objetivo: obtener la secuencia EXACTA de bytes que el driver oficial
CHECKPOINT_KX_500.exe envia al KX-500 en cada accion (solid red, per-key, etc.)

Formato pcapng:
  0x0A0D0D0A  Section Header Block (SHB)
  0x00000001  Interface Description Block (IDB)
  0x00000006  Enhanced Packet Block (EPB)
  0x00000003  Simple Packet Block (SPB)

Formato USBPcap packet header (LINKTYPE_USBPCAP = 249):
  offset 0:  UINT64 headerId
  offset 8:  UINT64 irpId
  offset 16: UINT32 status
  offset 20: UINT16 function
  offset 22: UINT16 info      (bit 6 = 1 -> IN, 0 -> OUT)
  offset 24: UINT16 bus
  offset 26: UINT16 device
  offset 28: UINT8  endpoint
  offset 29: UINT8  transfer   (0x00=ISO, 0x01=Interrupt, 0x02=Control, 0x03=Bulk)
  offset 30: UINT64 dataLength
  offset 38: UINT32 urbLength
  offset 42: UINT64 timestamp
  offset 50: UINT32 timestampMicro/nanoseconds
  total header = 54 bytes
"""
import struct
import sys
from pathlib import Path

LINKTYPE_USBPCAP = 249

BLOCK_SHB = 0x0A0D0D0A
BLOCK_IDB = 0x00000001
BLOCK_SPB = 0x00000003
BLOCK_EPB = 0x00000006


def iter_blocks(data):
    """Itera los bloques pcapng, yield (block_type, total_length, body, block_offset)."""
    off = 0
    n = len(data)
    while off + 8 <= n:
        btype, blen = struct.unpack_from("<II", data, off)
        if blen < 12 or off + blen > n:
            # intentar recover: hay little-endian y big-endian
            break
        body = data[off + 8: off + blen - 4]
        yield btype, blen, body, off
        off += blen


def parse_usb_pcap_packet(pkt):
    """Parsea un paquete USBPcap. Devuelve dict o None."""
    if len(pkt) < 54:
        return None
    headerId, irpId, status, function, info, bus, device, endpoint, transfer, dataLength, urbLength = \
        struct.unpack_from("<QQIHHHHBBQI", pkt, 0)
    if headerId != 0:
        # no es USBPcap
        return None
    ts = struct.unpack_from("<Q", pkt, 42)[0]
    data = pkt[54:54 + min(dataLength, len(pkt) - 54)]
    is_in = bool(info & 0x40)
    return {
        "irpId": irpId,
        "status": status,
        "function": function,
        "info": info,
        "bus": bus,
        "device": device,
        "endpoint": endpoint,
        "transfer": transfer,
        "dataLength": dataLength,
        "urbLength": urbLength,
        "ts": ts,
        "is_in": is_in,
        "data": data,
    }


def main():
    if len(sys.argv) < 2:
        print("uso: python parse_pcapng_usb.py <archivo.pcapng> [--all]")
        print("      python parse_pcapng_usb.py carpeta/*.pcapng")
        return 1

    files = []
    for a in sys.argv[1:]:
        if a.startswith("--"):
            continue
        p = Path(a)
        if p.is_dir():
            files.extend(sorted(p.glob("*.pcapng")))
        elif p.exists():
            files.append(p)
        else:
            # glob
            base = p.parent
            files.extend(sorted(base.glob(p.name)))

    if not files:
        print("No se encontraron archivos")
        return 1

    for f in files:
        data = f.read_bytes()
        print()
        print("=" * 90)
        print(f"  {f.name}  ({len(data)} bytes)")
        print("=" * 90)

        linktypes = {}
        packets = []
        for btype, blen, body, off in iter_blocks(data):
            if btype == BLOCK_IDB:
                linktype = struct.unpack_from("<H", body, 0)[0]
                linktypes[len(linktypes)] = linktype
                print(f"  [IDB] linktype = {linktype} "
                      f"{'(USBPcap)' if linktype == LINKTYPE_USBPCAP else ''}")
            elif btype == BLOCK_EPB:
                # interface_id(4) ts_high(4) ts_low(4) cap_len(4) orig_len(4) + data
                cap_len = struct.unpack_from("<I", body, 16)[0]
                pkt = body[20:20 + cap_len]
                packets.append(pkt)
            elif btype == BLOCK_SPB:
                pkt = body
                packets.append(pkt)

        print(f"  Total paquetes: {len(packets)}")

        if not packets:
            continue

        usb_packets = []
        for i, pkt in enumerate(packets):
            u = parse_usb_pcap_packet(pkt)
            if u:
                u["idx"] = i
                usb_packets.append(u)

        print(f"  Paquetes USBPcap parseados: {len(usb_packets)}")

        if not usb_packets:
            print("  (no se pudo parsear ningun paquete USBPcap — linktype puede ser otro)")
            continue

        transfers = {}
        for u in usb_packets:
            key = (u["transfer"], u["is_in"], u["endpoint"])
            transfers[key] = transfers.get(key, 0) + 1
        print(f"  Resumen (transfer, dir, endpoint) -> count:")
        for (tr, is_in, ep), cnt in sorted(transfers.items()):
            trname = {0: "ISOCHRONOUS", 1: "INTERRUPT", 2: "CONTROL", 3: "BULK"}.get(tr, f"T{tr}")
            print(f"    {trname:<14} {'IN ' if is_in else 'OUT'}  EP 0x{ep:02X}  -> {cnt}")

        # Extraer paquetes OUT que empiezan con 0x04 (nuestros Output Reports)
        print()
        print("  --- Paquetes OUT de datos (endpoint 0x03) ---")
        rgb_packets = []
        for u in usb_packets:
            if u["is_in"] or u["endpoint"] != 0x03:
                continue
            if not u["data"]:
                continue
            rgb_packets.append(u)

        print(f"  Total paquetes OUT en EP 0x03: {len(rgb_packets)}")
        for u in rgb_packets[:80]:
            d = u["data"]
            hexstr = " ".join(f"{b:02X}" for b in d)
            print(f"    irp={u['irpId']:<6} len={len(d):<4} {hexstr}")

    return 0


if __name__ == "__main__":
    sys.exit(main())