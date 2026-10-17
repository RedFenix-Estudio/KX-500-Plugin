# -*- coding: utf-8 -*-
"""
parse_urb.py
============
Parser de capturas USBPcap en modo URB (Windows 8+ mode).

Hallazgo: las capturas del driver oficial estan en modo URB, no en el modo
header+data clasico. El layout es la estructura URB real de Windows:

  URB_CONTROL_VENDOR_OR_CLASS_REQUEST (function 0x000B)  headerLength=0x1C
    +0x00 USHORT HeaderLength      = 0x001C (28)
    +0x02 USHORT HeaderSignature
    +0x04 ULONG  Reserved / Length
    +0x06 USHORT MaximumPacketSize
    +0x08 UINT64 Reserved
    +0x10 USHORT URBLink
    +0x12 USHORT URB_FUNCTION       = 0x000B (WinUsb class API!)
    +0x14 UCHAR  SetupPacket[8]     = bmRequestType bRequest wValue wIndex wLength

  URB_BULK_OR_INTERRUPT_TRANSFER_REQUEST (function 0x0003)  headerLength=0x38
    +0x00 USHORT HeaderLength
    +0x02 USHORT HeaderSignature
    +0x04 USHORT Length             = longitud del payload de datos
    +0x06 USHORT MaximumPacketSize
    +0x08 UINT64 Reserved
    +0x10 USHORT URBLink
    +0x12 USHORT URB_FUNCTION       = 0x0003
    +0x14 USHORT Interface
    +0x16 UCHAR  Endpoint
    +0x17 UCHAR  Reserved
    +0x18 USHORT TransferFlags
    +0x1C ULONG  TransferBufferLength
    +0x20 ptr64  TransferBufferMDL
    +0x28 ULONG  TransferBufferOffset
    payload = buffer[TransferBufferOffset : +Length]

Descubrimiento clave del analisis:
  El driver oficial usa WinUsb (URB_FUNCTION 0x000B para control transfers),
  NO WriteFile/HidD_SetOutputReport. Eso explica por que el firmware se
  comporta distinto segun quien hable con el.
"""
import struct
import sys
from pathlib import Path

BLOCK_SHB = 0x0A0D0D0A
BLOCK_IDB = 0x00000001
BLOCK_SPB = 0x00000003
BLOCK_EPB = 0x00000006

URB_FUNCTIONS = {
    0x0000: "SELECT_CONFIGURATION",
    0x0001: "SELECT_INTERFACE",
    0x0002: "CONTROL_TRANSFER",
    0x0003: "BULK_OR_INTERRUPT_TRANSFER",
    0x0004: "ISOCH_TRANSFER",
    0x0005: "CONTROL_VENDOR_OR_CLASS_REQUEST",
    0x000B: "CLASS_DEVICE (WinUsb)",
    0x000C: "VENDOR_DEVICE",
    0x000D: "CLASS_OTHER",
    0x000E: "VENDOR_OTHER",
    0x000F: "CONTROL_TRANSFER_EX",
    0x0017: "BULK_OR_INTERRUPT_TRANSFER_USING_CHAINED_MDL",
}


def iter_epb(data):
    off = 0
    n = len(data)
    idx = 0
    while off + 8 <= n:
        bt, bl = struct.unpack_from("<II", data, off)
        if bl < 12 or off + bl > n:
            break
        if bt == BLOCK_EPB:
            cap = struct.unpack_from("<I", data, off + 8 + 16)[0]
            yield idx, data[off + 8 + 20: off + 8 + 20 + cap]
            idx += 1
        elif bt == BLOCK_SPB:
            yield idx, data[off + 8: off + bl - 4]
            idx += 1
        off += bl


def parse_urb(pkt):
    """Devuelve dict con la info del URB, o None si no parece un URB."""
    if len(pkt) < 20:
        return None
    header_len = struct.unpack_from("<H", pkt, 0)[0]
    if header_len not in (0x1C, 0x38, 0x30, 0x28, 0x34, 0x48):
        return None
    function = struct.unpack_from("<H", pkt, 0x12)[0]

    out = {
        "header_len": header_len,
        "function": function,
        "fname": URB_FUNCTIONS.get(function, f"FUNC_{function:#06x}"),
        "payload": b"",
        "setup": b"",
        "endpoint": None,
        "direction": None,
        "interface": None,
    }

    if function in (0x000B, 0x000C, 0x000D, 0x000E, 0x0002, 0x000F):
        # control/vendor/class
        out["setup"] = pkt[0x14:0x1C]
        # los datos de control van despues del URB
        rest = pkt[header_len:]
        out["payload"] = rest
    elif function == 0x0003:
        length = struct.unpack_from("<H", pkt, 0x04)[0]
        interface = struct.unpack_from("<H", pkt, 0x14)[0]
        endpoint = pkt[0x16]
        transfer_flags = struct.unpack_from("<H", pkt, 0x18)[0]
        buf_len = struct.unpack_from("<I", pkt, 0x1C)[0]
        buf_off = struct.unpack_from("<I", pkt, 0x28)[0]
        out["interface"] = interface
        out["endpoint"] = endpoint
        # bit 0 de TransferFlags: 0 = OUT (host->device), 1 = IN
        out["direction"] = "IN" if (transfer_flags & 0x01) else "OUT"
        start = buf_off if buf_off else header_len
        # si buf_off es 0 o invalido, usar el final del header
        if start < header_len or start + length > len(pkt):
            start = header_len
        out["payload"] = pkt[start:start + length]
        out["declared_length"] = length
        out["buf_len"] = buf_len
    else:
        out["payload"] = pkt[header_len:]

    return out


def describe_setup(s):
    if len(s) < 8:
        return ""
    bm, bReq = s[0], s[1]
    wVal, wIdx, wLen = struct.unpack_from("<HHH", s, 2)
    drv = "Host->Dev" if not (bm & 0x80) else "Dev->Host"
    typ = {0: "STD", 1: "CLASS", 2: "VENDOR", 3: "RESERVED"}.get(bm >> 5, "?")
    return f"{typ} {drv} bRequest={bReq:#04x} wValue={wVal:#06x} wIndex={wIdx:#06x} wLength={wLen}"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    show_all = "--all" in sys.argv
    if not args:
        print("uso: python parse_urb.py <archivo.pcapng|carpeta> [--all]")
        return 1

    files = []
    for a in args:
        p = Path(a)
        if p.is_dir():
            files.extend(sorted(p.glob("*.pcapng")))
        elif p.exists():
            files.append(p)
        else:
            files.extend(sorted(p.parent.glob(p.name)))

    for f in files:
        data = f.read_bytes()
        print()
        print("=" * 100)
        print(f"  {f.name}  ({len(data)} bytes)")
        print("=" * 100)

        urbs = []
        for idx, pkt in iter_epb(data):
            u = parse_urb(pkt)
            if u:
                u["idx"] = idx
                u["raw_len"] = len(pkt)
                urbs.append(u)

        if not urbs:
            print("  (ningun URB reconocido)")
            continue

        funcs = {}
        for u in urbs:
            funcs[u["fname"]] = funcs.get(u["fname"], 0) + 1
        print("  Funciones URB:")
        for k, v in sorted(funcs.items()):
            print(f"    {k:<42} {v}")

        # Paquetes de datos hacia el dispositivo
        data_pkts = [u for u in urbs
                     if u["function"] in (0x0003,)
                     and u.get("direction") == "OUT"
                     and u.get("payload")]

        print(f"\n  Paquetes OUT con datos (function 0x0003): {len(data_pkts)}")
        for u in data_pkts[:120]:
            p = u["payload"]
            hexstr = " ".join(f"{b:02X}" for b in p[:80])
            if len(p) > 80:
                hexstr += " ..."
            print(f"    [{u['idx']:>4}] IF{u['interface']} EP{u['endpoint']:02X} len={len(p):<4} {hexstr}")

        # Control transfers (WinUsb)
        ctrl = [u for u in urbs if u["function"] == 0x000B and u["payload"]]
        if ctrl:
            print(f"\n  Control transfers (WinUsb) con datos: {len(ctrl)}")
            for u in ctrl[:60]:
                print(f"    [{u['idx']:>4}] {describe_setup(u['setup'])}")
                hexstr = " ".join(f"{b:02X}" for b in u["payload"][:64])
                print(f"            data({len(u['payload'])}): {hexstr}")

    return 0


if __name__ == "__main__":
    sys.exit(main())