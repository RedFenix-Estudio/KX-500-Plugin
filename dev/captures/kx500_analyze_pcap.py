#!/usr/bin/env python3
"""
Analizador de capturas USBPcap del KX-500 (VID 0x320F, PID 0x5008).
Detecta feature reports, hace diff entre frames consecutivos, busca el header del protocolo.

Uso:
    python kx500_analyze_pcap_v2.py captura.pcapng
    python kx500_analyze_pcap_v2.py captura.pcapng --filter-kx500
    python kx500_analyze_pcap_v2.py captura.pcapng --payload-only

Soporta: pcap clásico (magic 0xa1b2c3d4) y pcapng (Section Header Block 0x0A0D0D0A).
"""
import struct
import sys
from pathlib import Path
from collections import Counter


VID_KX500 = 0x320F
PID_KX500 = 0x5008


def parse_pcap(path):
    """Parser universal: pcap clásico o pcapng. Genera tuplas (timestamp, urb_header_dict, payload)."""
    data = Path(path).read_bytes()
    if len(data) < 4:
        return

    magic = data[:4]
    if magic == b"\x0a\x0d\x0d\x0a":
        yield from _parse_pcapng(data)
    elif struct.unpack("<I", magic)[0] == 0xA1B2C3D4:
        yield from _parse_pcap(data, "<")
    elif struct.unpack(">I", magic)[0] == 0xA1B2C3D4:
        yield from _parse_pcap(data, ">")
    else:
        print(f"  [ERROR] No es pcap ni pcapng válido. Magic: {magic.hex()}")


def _parse_pcap(data, endian):
    """Parser pcap clásico. Link type 249 = USBPcap, 220 = USB Linux MMAPPED."""
    link_type = struct.unpack(endian + "I", data[20:24])[0]
    if link_type not in (249, 220):
        print(f"  [WARN] Link type {link_type} no es USB. Esperaba 249 (USBPcap).")
    offset = 24
    pkt_num = 0
    while offset + 16 <= len(data):
        ts_sec, ts_usec, incl_len, _ = struct.unpack(endian + "IIII", data[offset:offset + 16])
        offset += 16
        if offset + incl_len > len(data):
            break
        pkt = data[offset:offset + incl_len]
        offset += incl_len
        pkt_num += 1
        ts = ts_sec + ts_usec / 1_000_000
        for ev in _parse_usbpcap_packet(pkt, ts, pkt_num):
            yield ev


def _parse_pcapng(data):
    """Parser pcapng mínimo: solo Enhanced Packet Blocks. Suficiente para Wireshark."""
    offset = 0
    pkt_num = 0
    le = True  # pcapng usa little-endian
    while offset + 12 <= len(data):
        block_type, block_len = struct.unpack("<II", data[offset:offset + 8])
        body = data[offset + 8:offset + block_len - 4]  # menos trailing block_len
        if block_type == 6:  # Enhanced Packet Block
            pkt_num += 1
            ts_hi, ts_lo = struct.unpack("<II", body[0:8])
            ts = (ts_hi << 32 | ts_lo) / 1_000_000  # Wireshark default: microsegundos
            cap_len, _ = struct.unpack("<II", body[8:16])
            pkt = body[16:16 + cap_len]
            for ev in _parse_usbpcap_packet(pkt, ts, pkt_num):
                yield ev
        offset += block_len
        if block_len < 12:
            break


def _parse_usbpcap_packet(pkt, ts, pkt_num):
    """Parsea un paquete USBPcap. Devuelve dict con header y payload."""
    if len(pkt) < 27:
        return
    header_len = pkt[0]
    if header_len < 27 or header_len > len(pkt):
        return
    irp_id = struct.unpack("<Q", pkt[1:9])[0]
    irp_status = struct.unpack("<I", pkt[9:13])[0]
    urb_function = struct.unpack("<H", pkt[13:15])[0]
    bus_id = struct.unpack("<H", pkt[16:18])[0]
    device = struct.unpack("<H", pkt[18:20])[0]
    endpoint = pkt[20]
    transfer_type = pkt[21]
    data_len = struct.unpack("<I", pkt[22:26])[0]
    payload = pkt[header_len:header_len + data_len]
    yield {
        "pkt_num": pkt_num,
        "ts": ts,
        "bus_id": bus_id,
        "device": device,
        "endpoint": endpoint,
        "transfer_type": transfer_type,
        "urb_function": urb_function,
        "data_len": data_len,
        "payload": payload,
    }


# URB functions interesantes para HID feature reports
# Referencia: https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/usb/ne-usb-_urb_function
URB_FUNCTION_GET_DESCRIPTOR_FROM_DEVICE = 0x000B
URB_FUNCTION_GET_DESCRIPTOR_FROM_ENDPOINT = 0x000C
URB_FUNCTION_VENDOR_DEVICE = 0x0020  # Control transfer vendor-specific
URB_FUNCTION_CLASS_DEVICE = 0x001F
URB_FUNCTION_CLASS_OTHER = 0x002E
URB_FUNCTION_GET_REPORT = 0x002B
URB_FUNCTION_SET_REPORT = 0x0030
URB_FUNCTION_GET_MS_FEATURE_DESCRIPTOR = 0x0037


def is_kx500(urb):
    """Heurística: ¿es del KX-500? Buscamos por device address conocido o por contenido."""
    return True  # Filtramos por contenido abajo


def classify_transfer(urb):
    """Clasifica el tipo de transferencia para filtrar."""
    tt = urb["transfer_type"]
    # 0=ISO, 1=Control, 2=Bulk, 3=Interrupt
    return {0: "ISO", 1: "CTRL", 2: "BULK", 3: "INTR"}.get(tt, f"?{tt}")


def endpoint_direction(endpoint):
    """bit 7 = direction: 0=OUT (host→device), 1=IN (device→host)"""
    return "OUT" if (endpoint & 0x80) == 0 else "IN"


def looks_like_rgb_frame(payload):
    """¿Parece un frame RGB del KX-500?
    Heurística: 320 bytes (8 hdr + 104×3), o múltiplos.
    """
    if len(payload) < 16:
        return False
    # Si los bytes 8-15 son idénticos a bytes 16-23, probablemente es padding/header repetido
    return len(payload) in (320, 312, 160, 96, 64, 48, 32, 16)


def analyze(path, filter_kx500=False, payload_only=False):
    """Analiza la captura completa."""
    print(f"\n=== {path} ===\n")

    events = list(parse_pcap(path))
    print(f"Total eventos parseados: {len(events)}")

    # Stats globales
    by_type = Counter()
    by_endpoint = Counter()
    by_direction = Counter()
    out_frames = []  # OUT payloads > 8 bytes
    all_out_payloads = []

    for e in events:
        t = classify_transfer(e)
        d = endpoint_direction(e["endpoint"])
        by_type[t] += 1
        by_endpoint[e["endpoint"]] += 1
        by_direction[d] += 1

        if d == "OUT" and e["payload"]:
            all_out_payloads.append(e)
            if e["data_len"] >= 8:
                out_frames.append(e)

    print(f"\nPor tipo de transferencia: {dict(by_type)}")
    print(f"Por endpoint: {dict(by_endpoint)}")
    print(f"Por dirección: {dict(by_direction)}")

    # Filtrar a OUT (host → device)
    if not out_frames:
        print("\n[!] No se encontraron frames OUT. ¿Seguro que capturaste mientras escribías/cambiabas colores?")
        return

    # Estadísticas de longitud
    lens = Counter(e["data_len"] for e in out_frames)
    print(f"\nLongitudes de payloads OUT (top 10): {lens.most_common(10)}")

    # Buscar el frame más repetido (probablemente heartbeat / ID frame)
    payloads = [bytes(e["payload"]) for e in out_frames]
    payload_counts = Counter(payloads)
    print(f"\nPayloads OUT únicos: {len(payload_counts)} (de {len(payloads)} totales)")
    print(f"Top 5 payloads más repetidos:")
    for p, n in payload_counts.most_common(5):
        if len(p) > 64:
            preview = f"{p[:32].hex()}...{p[-16:].hex()} ({len(p)} bytes)"
        else:
            preview = p.hex()
        print(f"  [{n}x] {preview}")

    # Agrupar por longitud y mostrar el primero de cada tamaño
    print(f"\nFrames OUT por longitud (primer frame de cada tamaño):")
    seen_lens = set()
    for e in out_frames:
        ln = e["data_len"]
        if ln not in seen_lens:
            seen_lens.add(ln)
            ep_str = f"0x{e['endpoint']:02x}"
            ts_str = f"t={e['ts']:.6f}"
            payload = e["payload"]
            if ln > 64:
                preview = f"{payload[:16].hex()}...{payload[-8:].hex()}"
            else:
                preview = payload.hex()
            print(f"  len={ln:4d}  ep={ep_str}  {ts_str}  data={preview}")

    # Diff entre frames consecutivos (mismo endpoint, misma longitud)
    print(f"\n=== DIFF entre frames consecutivos ===")
    prev_by_len = {}
    diffs = []
    for e in out_frames:
        key = (e["endpoint"], e["data_len"])
        if key in prev_by_len:
            prev = prev_by_len[key]["payload"]
            curr = e["payload"]
            if len(prev) == len(curr):
                changed = []
                for i, (a, b) in enumerate(zip(prev, curr)):
                    if a != b:
                        changed.append((i, a, b))
                if changed:
                    diffs.append((e, prev, curr, changed))
        prev_by_len[key] = e

    print(f"Total diffs: {len(diffs)}")
    if diffs:
        print(f"\nPrimeros 5 diffs:")
        for e, prev, curr, changed in diffs[:5]:
            print(f"\n  --- Pkt #{e['pkt_num']} (t={e['ts']:.6f}, len={e['data_len']}) ---")
            print(f"  prev: {prev[:32].hex()}{'...' if len(prev) > 32 else ''}")
            print(f"  curr: {curr[:32].hex()}{'...' if len(curr) > 32 else ''}")
            print(f"  Changed bytes ({len(changed)} total):")
            for pos, a, b in changed[:20]:
                print(f"    offset {pos:3d}: 0x{a:02x} → 0x{b:02x}")
            if len(changed) > 20:
                print(f"    ... y {len(changed) - 20} más")

    # Detección de header: bytes que NUNCA cambian entre frames
    print(f"\n=== Detección de header (bytes constantes entre frames) ===")
    if len(out_frames) >= 3:
        # Solo miramos frames de la misma longitud
        for ln in sorted(lens.keys(), reverse=True):
            same_len = [e["payload"] for e in out_frames if e["data_len"] == ln]
            if len(same_len) < 3:
                continue
            min_len = min(len(p) for p in same_len)
            constant_positions = []
            variable_positions = []
            for i in range(min_len):
                vals = set(p[i] for p in same_len)
                if len(vals) == 1:
                    constant_positions.append((i, same_len[0][i]))
                else:
                    variable_positions.append(i)
            if constant_positions:
                print(f"\n  Longitud {ln} (analizados {len(same_len)} frames):")
                hdr = bytes(b for _, b in constant_positions[:32])
                tail = bytes(b for _, b in constant_positions[-16:]) if len(constant_positions) > 32 else b""
                print(f"    Header detectado ({len(constant_positions)} bytes constantes): {hdr.hex()}")
                if tail:
                    print(f"    Tail (últimos 16 const): {tail.hex()}")
                print(f"    Bytes variables ({len(variable_positions)}): {variable_positions[:32]}{'...' if len(variable_positions) > 32 else ''}")
                # Sugerencia
                if len(constant_positions) >= 8:
                    print(f"    � Sugerencia: el header podría ser los primeros {min(8, len(constant_positions))} bytes")
            break  # Solo analizamos la longitud más común


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = sys.argv[1]
    args = sys.argv[2:]
    filter_kx500 = "--filter-kx500" in args
    payload_only = "--payload-only" in args
    analyze(path, filter_kx500=filter_kx500, payload_only=payload_only)


if __name__ == "__main__":
    main()
