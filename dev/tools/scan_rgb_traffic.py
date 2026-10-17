# -*- coding: utf-8 -*-
"""
scan_rgb_traffic.py
===================
Escanea las capturas USBPcap buscando los Output Reports RGB (64 bytes que
empiezan con 0x04) sin depender del layout exacto del URB.

Heuristica: un paquete RGB tiene >= 11 bytes, empieza con 0x04, y contiene
la firma "01 06 03 05" (solid color) o "55 AA FF" (handshake) en los primeros bytes.

Devuelve, por cada archivo:
  - la secuencia completa de Output Reports en orden
  - un diff contra la secuencia que genera el plugin
"""
import struct
import sys
from pathlib import Path

BLOCK_EPB = 0x00000006
BLOCK_SPB = 0x00000003

# Firmas conocidas del protocolo KX-500
SIG_HANDSHAKE = bytes([0x04, 0xA2, 0x03, 0x04])
SIG_SOLID = bytes([0x06, 0x03, 0x05])
SIG_BRIGHTNESS = bytes([0x06, 0x01, 0x01])


def iter_packets(data):
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


def find_rgb_payloads(pkt):
    """Busca payloads RGB dentro de un paquete, en cualquier offset."""
    found = []
    n = len(pkt)
    for i in range(n - 10):
        if pkt[i] != 0x04:
            continue
        # handshake?
        if pkt[i:i + 4] == SIG_HANDSHAKE:
            found.append((i, "HANDSHAKE", pkt[i:i + 64] if i + 64 <= n else pkt[i:]))
            i += 63
            continue
        # solid color / brightness?
        if pkt[i + 3:i + 6] == SIG_SOLID or pkt[i + 3:i + 6] == SIG_BRIGHTNESS:
            kind = "SOLID" if pkt[i + 3:i + 6] == SIG_SOLID else "BRIGHT"
            found.append((i, kind, pkt[i:i + 64] if i + 64 <= n else pkt[i:]))
            i += 63
    return found


def classify(p):
    """Clasifica un payload RGB de 64 bytes."""
    if len(p) < 11:
        return "SHORT"
    if p[0:4] == SIG_HANDSHAKE:
        return "HANDSHAKE"
    if p[3:6] == SIG_SOLID:
        cmd = p[3:6]
        r, g, b = p[8], p[9], p[10]
        return f"SOLID(seq=0x{p[1]:02X},byte2=0x{p[2]:02X}) R={r} G={g} B={b}"
    if p[3:6] == SIG_BRIGHTNESS:
        lvl = p[8] if len(p) > 8 else 0
        return f"BRIGHTNESS(seq=0x{p[1]:02X},byte2=0x{p[2]:02X}) level={lvl}"
    return f"UNKNOWN(seq=0x{p[1]:02X},byte2=0x{p[2]:02X})"


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    only = None
    for a in sys.argv[1:]:
        if a.startswith("--only="):
            only = a.split("=", 1)[1]

    if not args:
        print("uso: python scan_rgb_traffic.py <archivo.pcapng|carpeta> [--only=N]")
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

    grand_total = 0
    for f in files:
        data = f.read_bytes()
        rows = []
        for idx, pkt in iter_packets(data):
            for off_in_pkt, kind, payload in find_rgb_payloads(pkt):
                rows.append((idx, off_in_pkt, kind, payload))

        if not rows:
            continue
        grand_total += len(rows)

        label = f.name
        if only and only.lower() not in label.lower():
            continue

        print()
        print("=" * 104)
        print(f"  {label}")
        print("=" * 104)
        print(f"  {len(rows)} Output Report(s) RGB detectado(s)")
        print()
        for seq, (idx, off_in_pkt, kind, payload) in enumerate(rows):
            hexstr = " ".join(f"{b:02X}" for b in payload[:16])
            print(f"   #{seq:<3} pkt={idx:<5} {classify(payload)}")
            print(f"        {hexstr}")
            if kind == "SOLID" and len(payload) > 16:
                # mostrar si el resto tiene algo no-cero (per-key?)
                rest = payload[16:]
                nonzero = [(i + 16, b) for i, b in enumerate(rest) if b != 0]
                if nonzero:
                    head = " ".join(f"[{i}]={b:02X}" for i, b in nonzero[:12])
                    print(f"        resto no-cero: {head} {'...' if len(nonzero) > 12 else ''} (total {len(nonzero)} bytes)")

    print()
    print(f"  TOTAL Output Reports RGB en todos los archivos: {grand_total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())