# -*- coding: utf-8 -*-
"""
enumerate_commands.py
=====================
Enumera TODOS los comandos distintos que el driver oficial envia,
extrayendo el patron  04 [SEQ] [BYTE2] 06 [C1] [C2]  de las capturas.

Objetivo: entender que significan BYTE2 y C1/C2, y cuantos paquetes
forman un frame completo (RGB de 104 teclas).
"""
import re
import struct
import sys
from collections import Counter, defaultdict
from pathlib import Path

CAP_DIR = Path(r"E:\Erik\Aplicaciones\PC\KX-500 RGB teclado\Captura de Wirseshark del teclado")

# patron: 04 [SEQ] [BYTE2] 06 [C1] [C2]
#   bytes: [0]=04  [1]=SEQ  [2]=BYTE2  [3]=06  [4]=C1  [5]=C2
PAT = re.compile(rb"\x04(..)\x06(..)", re.DOTALL)

# Handshake
PAT_HS = re.compile(rb"\x04\xA2\x03\x04\x2C")


def main():
    files = sorted(CAP_DIR.glob("*.pcapng"))
    cmd_counter = Counter()
    cmd_examples = defaultdict(list)
    byte2_for_cmd = defaultdict(set)
    hs_files = []

    for f in files:
        d = f.read_bytes()

        # handshake
        hs = len(PAT_HS.findall(d))
        if hs:
            hs_files.append((f.name, hs))

        for m in PAT.finditer(d):
            seq = m.group(1)[0]
            b2 = m.group(1)[1]
            c1 = m.group(2)[0]
            c2 = m.group(2)[1]
            key = (b2, c1, c2)
            cmd_counter[key] += 1
            byte2_for_cmd[key].add(b2)
            # payload completo para contexto
            start = m.start()
            payload = d[start:start + 64]
            cmd_examples[key].append((f.name, payload))

    print("=" * 96)
    print("  COMANDOS ENCONTRADOS EN LAS CAPTURAS DEL DRIVER OFICIAL")
    print("=" * 96)
    print()
    print(f"  {'BYTE2':<6} {'C1':<5} {'C2':<5} {'VECES':<7} {'nombre probable'}")
    print("  " + "-" * 84)

    NAMES = {
        (0x03, 0x05): "SOLID COLOR (un solo color global)",
        (0x01, 0x01): "BRIGHTNESS",
    }

    for (b2, c1, c2), cnt in sorted(cmd_counter.items(), key=lambda x: -x[1]):
        name = NAMES.get((c1, c2), f"CMD_06_{c1:02X}_{c2:02X}")
        print(f"  0x{b2:02X}    0x{c1:02X}  0x{c2:02X}  {cnt:<7} {name}")

    print()
    print("=" * 96)
    print("  AGRUPADO POR COMANDO (ignorando byte2)")
    print("=" * 96)
    by_cmd = defaultdict(lambda: {"count": 0, "byte2": set()})
    for (b2, c1, c2), cnt in cmd_counter.items():
        k = (c1, c2)
        by_cmd[k]["count"] += cnt
        by_cmd[k]["byte2"].add(b2)

    for (c1, c2), info in sorted(by_cmd.items(), key=lambda x: -x[1]["count"]):
        name = NAMES.get((c1, c2), f"CMD_06_{c1:02X}_{c2:02X}")
        b2s = ", ".join(f"0x{b:02X}" for b in sorted(info["byte2"]))
        print(f"  06 {c1:02X} {c2:02X}  = {name}")
        print(f"      {info['count']} ocurrencias | byte2 vistos: {b2s}")
        print()

    print("=" * 96)
    print("  EJEMPLOS DE PAYLOAD (primeros 24 bytes)")
    print("=" * 96)
    for (c1, c2), info in sorted(by_cmd.items(), key=lambda x: -x[1]["count"]):
        name = NAMES.get((c1, c2), f"CMD_06_{c1:02X}_{c2:02X}")
        print(f"\n  --- 06 {c1:02X} {c2:02X}  ({name}) ---")
        shown = 0
        for fname, payload in cmd_examples[(0x01, c1, c2)] + cmd_examples[(0x00, c1, c2)]:
            hexs = " ".join(f"{b:02X}" for b in payload[:24])
            nz = sum(1 for b in payload[11:64] if b != 0)
            print(f"    {fname:<42} {hexs}   [no-cero en 11..63: {nz}]")
            shown += 1
            if shown >= 6:
                break

    print()
    print("=" * 96)
    print("  HANDSHAKES POR ARCHIVO")
    print("=" * 96)
    for fname, cnt in hs_files:
        print(f"    {fname:<50} x{cnt}")

    print()
    print("=" * 96)
    print("  HALLAZGO CLAVE")
    print("=" * 96)
    print("  Si un mismo comando aparece con varios valores de BYTE2 (0x00..0x03),")
    print("  entonces BYTE2 NO es un flag de modo sino el INDICE DE CHUNK del frame.")
    print("  El frame RGB completo de 104 teclas no caben en 64 bytes, asi que el")
    print("  driver oficial lo divide en N paquetes y byte2 = 0..N-1.")
    print()
    print("  El plugin actual envia UN SOLO paquete (byte2=0x01), es decir solo")
    print("  el chunk 1 de N. Por eso 'no funciona como se espera': el teclado")
    print("  recibe un frame incompleto / desalineado.")


if __name__ == "__main__":
    main()