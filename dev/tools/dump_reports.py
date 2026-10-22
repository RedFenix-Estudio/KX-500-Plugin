# -*- coding: utf-8 -*-
"""
dump_reports.py
===============
Volcado SECUENCIAL de todos los Output Reports (64 bytes, [0]=0x04) de una
captura USBPcap del KX-500, sin filtrar por comando.

A diferencia de scan_rgb_traffic.py (que solo reconoce 06 03 05 y 06 01 01),
esto muestra TODO lo que el driver oficial manda, en orden, que es lo que
hace falta para reconstruir la secuencia real de "color solido", "per-key"
y "cambio de animacion".

Uso:
    python dump_reports.py <archivo.pcapng|...> [--raw] [--tail]

    --raw   muestra los 64 bytes completos
    --tail  muestra los bytes no-cero de 11..63 (util para per-key/chunks)
"""
import struct
import sys
from pathlib import Path

BLOCK_EPB = 0x00000006
BLOCK_SPB = 0x00000003


def iter_packets(data):
    """Devuelve el payload de cada bloque EPB/SPB del pcapng."""
    off = 0
    n = len(data)
    while off + 12 <= n:
        bt, bl = struct.unpack_from("<II", data, off)
        if bl < 12 or off + bl > n:
            break
        if bt == BLOCK_EPB:
            caplen = struct.unpack_from("<I", data, off + 20)[0]
            yield data[off + 28:off + 28 + caplen]
        elif bt == BLOCK_SPB:
            yield data[off + 8:off + bl - 4]
        off += bl


def usb_payload(pkt):
    """Extrae (endpoint, transfer, function, payload) del pseudo-header USBPcap.

    Layout real verificado sobre estas capturas (headerLen = 27 interrupt,
    28 control; el byte extra de control es el dataStage):
      [0:2]   headerLen
      [2:10]  irpId
      [10:14] status
      [14:16] function
      [16]    info
      [17:19] bus
      [19:21] device
      [21]    endpoint
      [22]    transfer   (0=iso 1=interrupt 2=control 3=bulk -- enum USBPcap)
      [23:27] dataLength
      [hdrLen:] data
    """
    if len(pkt) < 27:
        return None
    hdr_len = struct.unpack_from("<H", pkt, 0)[0]
    if hdr_len < 27 or hdr_len > len(pkt):
        return None
    function = struct.unpack_from("<H", pkt, 14)[0]
    transfer = pkt[22]
    endpoint = pkt[21]
    data_len = struct.unpack_from("<I", pkt, 23)[0]
    start = hdr_len
    if start + data_len > len(pkt):
        return None
    return endpoint, transfer, function, pkt[start:start + data_len]


# enum USBPcap
TR_ISO, TR_INT, TR_CTRL, TR_BULK = 0, 1, 2, 3


def find_reports(data):
    """Lista de (indice, origen, report64). Un report empieza con 0x04."""
    out = []
    for idx, pkt in enumerate(iter_packets(data)):
        parsed = usb_payload(pkt)
        if not parsed:
            continue
        ep, tr, func, payload = parsed
        if ep == 0x03 and len(payload) >= 64 and payload[0] == 0x04:
            out.append((idx, "int", payload[:64]))
            continue
        # control transfer SET_REPORT: bmRequestType=0x21 bRequest=0x09
        if tr == TR_CTRL and len(payload) >= 8 + 64 and payload[0] == 0x21 and payload[1] == 0x09:
            body = payload[8:]
            if body[0] == 0x04:
                out.append((idx, "ctl", body[:64]))
    return out


def combos(data):
    """Resumen de (function, transfer, endpoint, len) para diagnosticar."""
    from collections import Counter
    c = Counter()
    for pkt in iter_packets(data):
        parsed = usb_payload(pkt)
        if not parsed:
            continue
        ep, tr, func, payload = parsed
        c[(func, tr, ep, len(payload))] += 1
    return c


def cmd_name(p):
    c = (p[3], p[4], p[5])
    return {
        (0x01, 0x00, 0x01): "START",
        (0x02, 0x00, 0x02): "END",
        (0x06, 0x01, 0x00): "ANIM_ID",
        (0x06, 0x01, 0x01): "BRIGHTNESS",
        (0x06, 0x01, 0x02): "SPEED",
        (0x06, 0x01, 0x03): "DIRECTION",
        (0x06, 0x01, 0x04): "KEY_NORMALLY_ON",
        (0x06, 0x01, 0x11): "MODE/PRESET",
        (0x06, 0x03, 0x05): "COLOR_GLOBAL",
        (0x11, 0x03, 0x00): "PERKEY_BEGIN",
    }.get(c, f"CMD_{c[0]:02X}_{c[1]:02X}_{c[2]:02X}")


def compact(p):
    """Una sola linea por report, para ver la secuencia de un vistazo."""
    if p[:4] == bytes([0x04, 0xA2, 0x03, 0x04]):
        return "HANDSHAKE"
    c = cmd_name(p)
    if c in ("START", "END"):
        return f"{c:<15} seq=0x{p[1]:02X} b2=0x{p[2]:02X}"
    if c == "COLOR_GLOBAL":
        return (f"{c:<15} seq=0x{p[1]:02X} b2=0x{p[2]:02X} "
                f"RGB=({p[8]:3d},{p[9]:3d},{p[10]:3d})")
    if c == "PERKEY_BEGIN":
        nz = [(i, b) for i, b in enumerate(p) if i >= 6 and b]
        extra = " ".join(f"[{i}]={b:02X}" for i, b in nz[:10])
        return (f"{c:<15} seq=0x{p[1]:02X} b2=0x{p[2]:02X} "
                f"idx=0x{p[5]:02X} val={p[8]:02X} :: {extra}")
    nz = [(i, b) for i, b in enumerate(p) if i >= 6 and b]
    extra = " ".join(f"[{i}]={b:02X}" for i, b in nz[:8])
    return f"{c:<15} seq=0x{p[1]:02X} b2=0x{p[2]:02X} :: {extra}"


def describe(p, raw=False, tail=False):
    if p[:4] == bytes([0x04, 0xA2, 0x03, 0x04]):
        s = f"HANDSHAKE seq=0xA2 bytes={p[:24].hex(' ')}"
        return s
    name = cmd_name(p)
    head = p[:11].hex(" ")
    if name == "COLOR_GLOBAL":
        s = (f"{name:<14} seq=0x{p[1]:02X} b2=0x{p[2]:02X} "
             f"RGB=({p[8]:3d},{p[9]:3d},{p[10]:3d})")
    elif name in ("START", "END", "BRIGHTNESS", "ANIM_ID", "SPEED", "DIRECTION",
                  "KEY_NORMALLY_ON", "MODE/PRESET"):
        s = f"{name:<14} seq=0x{p[1]:02X} b2=0x{p[2]:02X} valor=0x{p[8]:02X} ({p[8]})"
    else:
        s = f"{name:<14} seq=0x{p[1]:02X} b2=0x{p[2]:02X} b6=0x{p[6]:02X} b8=0x{p[8]:02X}"
    if raw:
        s += "\n                 " + p.hex(" ")
    else:
        s += f"\n                 {head}"
    if tail:
        nz = [(i, b) for i, b in enumerate(p) if i >= 11 and b]
        if nz:
            s += "\n                 no-cero 11..63: " + " ".join(
                f"[{i}]={b:02X}" for i, b in nz[:24]) + (
                f" ... (+{len(nz) - 24})" if len(nz) > 24 else "")
    return s


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    raw = "--raw" in sys.argv
    tail = "--tail" in sys.argv
    if not args:
        print(__doc__)
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
        reps = find_reports(data)
        print()
        print("=" * 100)
        print(f"  {f.name}   ({len(reps)} output reports detectados)")
        print("=" * 100)
        if "--info" in sys.argv:
            for (func, tr, ep, ln), cnt in sorted(combos(data).items(), key=lambda x: -x[1]):
                print(f"    func=0x{func:04X} tr={tr} ep=0x{ep:02X} len={ln:<5} x{cnt}")
            print()
        prev = None
        dup = 0
        shown = 0
        compact_mode = "--compact" in sys.argv
        for idx, origin, p in reps:
            sig = bytes(p[:16])
            if sig == prev:
                dup += 1
                continue
            if dup:
                if not compact_mode:
                    print(f"   ... ({dup} duplicado(s) identico(s) seguidos)")
                dup = 0
            prev = sig
            shown += 1
            if compact_mode:
                print(f"  #{shown:<3} pkt={idx:<6} {compact(p)}")
            else:
                print(f"  #{shown:<3} pkt={idx:<6} [{origin}] {describe(p, raw, tail)}")
        if dup and not compact_mode:
            print(f"   ... ({dup} duplicado(s) identico(s) al final)")
        print(f"  -> {shown} distintos / {len(reps)} totales")
    return 0


if __name__ == "__main__":
    sys.exit(main())
