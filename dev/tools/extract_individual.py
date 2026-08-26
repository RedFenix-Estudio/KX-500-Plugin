#!/usr/bin/env python3
"""
Extractor de paquetes RGB HID Output Reports de las capturas individuales.

Filtramos los packets interrupt OUT a ep 0x03 (64 bytes) y los agrupamos por
captura. Cada acción produce un grupo de 3 paquetes: START, CMD, END.

Salida: stdout con grupos por captura, y un resumen único al final.
"""
import subprocess
import re
import sys
import os
from pathlib import Path

CAPTURES_DIR = Path(r"E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\kx500-signalrgb-plugin\dev\captures\individual")
TSHARK = r"C:\Program Files\Wireshark\tshark.exe"

# Acción esperada por nombre de captura (según el README)
ACTIONS = {
    "01_solid_red": "solid color ROJO",
    "02_solid_blue": "solid color AZUL",
    "03_per_key_one": "per-key 1 tecla",
    "04_brightness_up": "brillo ARRIBA",
    "05_brightness_down": "brillo ABAJO",
    "06_breathing": "efecto BREATHING",
    "08_off": "OFF / apagar",
    "10_colorful_NormallyOn": "colorful NormallyOn",
    "11_direccion_animacion": "dirección animación",
    "12_coastal_perkey": "coastal per-key",
    "13_perfiles_guardados": "perfiles guardados",
    "14_cambio_animaciones": "cambio animaciones",
    "15_un_solo_color": "un solo color",
    "16_velocidad_animacion": "velocidad animación",
    "17_brillo_varios": "brillo varios",
}


def list_captures():
    """Lista todos los .pcapng en el directorio."""
    out = []
    for p in sorted(CAPTURES_DIR.glob("*.pcapng")):
        out.append(p)
    return out


def extract_rgb_packets(pcap_path):
    """Extrae los HID data de los packets interrupt OUT a ep 0x03."""
    cmd = [
        TSHARK, "-r", str(pcap_path),
        "-Y", 'usb.endpoint_address == 0x03 and usb.transfer_type == 0x01',
        "-T", "fields",
        "-e", "frame.number",
        "-e", "frame.time_relative",
        "-e", "usb.src",
        "-e", "usb.dst",
        "-e", "usb.data_len",
        "-e", "usbhid.data",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        return []
    pkts = []
    for line in res.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) < 6:
            continue
        try:
            fnum = int(parts[0])
            t = float(parts[1])
            src = parts[2]
            dst = parts[3]
            dlen = int(parts[4]) if parts[4] else 0
            hex_data = parts[5].replace(":", "").strip()
        except ValueError:
            continue
        pkts.append({
            "frame": fnum,
            "t": t,
            "src": src,
            "dst": dst,
            "len": dlen,
            "data": hex_data,
        })
    return pkts


def pretty_hex(hex_data, max_bytes=16):
    """Formatea hex_data en pares 'xx xx xx...'."""
    if not hex_data:
        return "(empty)"
    pairs = [hex_data[i:i+2] for i in range(0, len(hex_data), 2)]
    if len(pairs) > max_bytes:
        head = " ".join(pairs[:max_bytes])
        return f"{head} ... ({len(pairs)} bytes)"
    return " ".join(pairs)


def group_action(pkts):
    """Agrupa los packets en acciones (START, CMD(s), END)."""
    actions = []
    current = {"start": None, "cmds": [], "end": None}
    for p in pkts:
        d = p["data"]
        if not d or len(d) < 4:
            continue
        b0 = int(d[0:2], 16)
        b1 = int(d[2:4], 16)
        if b0 == 0x04 and b1 == 0x01 and d[4:8] == "0001":
            # START
            if current["start"] or current["cmds"] or current["end"]:
                actions.append(current)
            current = {"start": p, "cmds": [], "end": None}
        elif b0 == 0x04 and b1 == 0x02 and d[4:8] == "0002":
            # END
            current["end"] = p
            actions.append(current)
            current = {"start": None, "cmds": [], "end": None}
        else:
            current["cmds"].append(p)
    if current["start"] or current["cmds"] or current["end"]:
        actions.append(current)
    return actions


def main():
    captures = list_captures()
    print(f"=== {len(captures)} capturas encontradas ===\n")
    
    all_cmds = {}  # cmd_byte -> set de capturas
    
    for pcap in captures:
        name = pcap.stem
        action = ACTIONS.get(name, "?")
        print(f"\n{'='*70}")
        print(f"[FILE] {name}.pcapng  ->  {action}")
        print(f"{'='*70}")
        
        pkts = extract_rgb_packets(pcap)
        if not pkts:
            print("  (no hay paquetes interrupt OUT a ep 0x03)")
            continue
        
        actions = group_action(pkts)
        for i, a in enumerate(actions, 1):
            print(f"\n  ── Acción {i} ──")
            if a["start"]:
                p = a["start"]
                print(f"  START  frame {p['frame']:>4} t={p['t']:.3f}  {pretty_hex(p['data'], 12)}")
            for p in a["cmds"]:
                data = p["data"]
                cmd_byte = data[2:4] if len(data) >= 2 else "??"
                all_cmds.setdefault(cmd_byte, set()).add(name)
                print(f"  CMD    frame {p['frame']:>4} t={p['t']:.3f}  cmd=0x{cmd_byte}  {pretty_hex(data, 16)}")
            if a["end"]:
                p = a["end"]
                print(f"  END    frame {p['frame']:>4} t={p['t']:.3f}  {pretty_hex(p['data'], 12)}")
            else:
                print(f"  END    (no se capturó)")
    
    # Resumen
    print(f"\n\n{'='*70}")
    print("RESUMEN DE COMANDOS ÚNICOS")
    print(f"{'='*70}")
    for cmd, caps in sorted(all_cmds.items()):
        print(f"  CMD 0x{cmd}  usado en: {', '.join(sorted(caps))}")


if __name__ == "__main__":
    main()
