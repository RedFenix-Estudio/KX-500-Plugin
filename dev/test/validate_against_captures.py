#!/usr/bin/env python3
"""
Validador offline: compara los bytes que el plugin genera con los
paquetes reales capturados del driver oficial.

Si el plugin produce bytes DIFERENTES a los que el driver envía,
el KX-500 los va a ignorar.
"""
import subprocess
import sys
from pathlib import Path

# Reusar el parser
sys.path.insert(0, str(Path(__file__).parent.parent / "tools"))
import importlib.util
spec = importlib.util.spec_from_file_location(
    "extract_individual",
    Path(__file__).parent.parent / "tools" / "extract_individual.py"
)
extract_individual = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extract_individual)

PCAPS = Path(r"E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\kx500-signalrgb-plugin\dev\captures\individual")

# Mapeo: nombre de captura -> comando que el plugin debería producir
# (comando + parámetros en hex)
EXPECTED = {
    "01_solid_red":        ("solid_red",  ["13", "01", "11", "03", "00", "00", "00", "ff", "00", "00"]),
    "02_solid_blue":       ("solid_blue", ["d9", "01", "11", "03", "ba", "00", "00", "06", "06", "ff", "00", "00"]),
    "04_brightness_up":    ("brightness_up_1", ["0b", "00", "06", "01", "01", "00", "00", "03"]),
    "06_breathing":        ("breathing", ["0c", "00", "06", "01", "00", "00", "00", "05"]),
    "08_off":              ("off",       ["08", "00", "06", "01", "01"]),
}


def get_capture_cmds(pcap_path):
    """Extrae todos los comandos (bytes 1..N) de los packets no-heartbeat."""
    pkts = extract_individual.extract_rgb_packets(pcap_path)
    cmds = []
    for p in pkts:
        d = p["data"]
        if not d:
            continue
        pairs = [d[i:i+2] for i in range(0, len(d), 2)]
        # Filtrar heartbeats
        if pairs[0] == "04" and pairs[1] in ("01", "02"):
            continue
        cmds.append(pairs)
    return cmds


def main():
    total_ok = 0
    total_fail = 0
    for pcap_name, (label, expected) in EXPECTED.items():
        pcap = PCAPS / f"{pcap_name}.pcapng"
        if not pcap.exists():
            print(f"  [SKIP] {pcap_name}.pcapng no existe")
            continue
        cmds = get_capture_cmds(pcap)
        if not cmds:
            print(f"  [SKIP] {pcap_name} sin paquetes RGB")
            continue
        # Buscar el primer paquete cuyo payload empiece con los bytes esperados
        found = False
        for cmd in cmds:
            if cmd[1:1+len(expected)] == expected:
                found = True
                break
        if found:
            print(f"  [OK]   {pcap_name:25s} -> {label:20s} coincide")
            total_ok += 1
        else:
            print(f"  [FAIL] {pcap_name:25s} -> {label:20s} NO coincide")
            print(f"         esperado: {' '.join(expected)}")
            print(f"         capturas:")
            for i, c in enumerate(cmds[:3]):
                print(f"           [{i}] {' '.join(c[:14])}")
            total_fail += 1

    print()
    print(f"Resumen: {total_ok} OK, {total_fail} FAIL")
    sys.exit(0 if total_fail == 0 else 1)


if __name__ == "__main__":
    main()
