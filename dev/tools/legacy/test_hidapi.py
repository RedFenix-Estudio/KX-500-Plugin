#!/usr/bin/env python3
"""
Test independiente del KX-500 RGB usando hidapi directo.

v4 con el flujo USB bulk transfer COMPLETO basado en análisis de las
capturas del driver oficial (teclado_un_solo_color.pcapng).

DESCUBRIMIENTOS:
1. Cada OUT va seguido de IN 0x03 0B (USB ACK) + IN 0x82 64B (ECHO del comando)
2. El flujo del driver oficial es: HB_START + CMD_effect_mode + CMD_color + HB_END
   con lecturas de echo entre cada write
3. El byte 2 del "set color" varía (0x00, 0x01, 0x02, 0x03) — no es siempre 0x01
4. hidapi en Python SÍ soporta read() después de write() para recoger el echo

Sin hacer read() después de cada write, el firmware se queda "esperando"
el acknowledgment y no procesa el siguiente comando.
"""
import sys
import time

try:
    import hid
except ImportError:
    print("ERROR: hidapi no instalado.")
    print("Instalar con: pip install hidapi")
    sys.exit(1)

VID = 0x320F
PID = 0x5008

# SEQ counter (incrementa en cada color change, como el driver oficial)
_seq = 0x08
def next_seq():
    global _seq
    s = _seq
    _seq = (_seq + 1) & 0xFF
    return s

# Heartbeat packets (4 bytes)
HB_START = [0x04, 0x01, 0x00, 0x01]
HB_END   = [0x04, 0x02, 0x00, 0x02]

def padded64(arr):
    """Convierte array a bytes de 64 bytes con padding."""
    out = bytearray(64)
    for i, b in enumerate(arr[:64]):
        out[i] = b
    return bytes(out)

def set_effect_mode(seq):
    """04 [SEQ] 00 06 01 04 00 00 00 — el 'pre-action' que el driver SIEMPRE
    manda antes de set color. Sin esto, el firmware no acepta el color."""
    return padded64([0x04, seq, 0x00, 0x06, 0x01, 0x04, 0x00, 0x00, 0x00])

def set_color(seq, byte2, r, g, b):
    """04 [SEQ] [byte2] 06 03 05 00 00 R G B.
    byte2 VARIA (0x00, 0x01, 0x02, 0x03) según el color change.
    Usamos un counter que el driver también usa."""
    return padded64([0x04, seq, byte2, 0x06, 0x03, 0x05, 0x00, 0x00, r, g, b])

def brightness_off():
    """04 08 00 06 01 01 — brightness 0 = OFF."""
    return padded64([0x04, 0x08, 0x00, 0x06, 0x01, 0x01])

def write_with_echo(h, packet, label):
    """Manda un paquete, espera el echo del dispositivo, lo loguea."""
    print(f"      [OUT] {label} (64B): {packet[:16].hex()}...")
    n = h.write(packet)
    if n != 64:
        print(f"      [OUT] write() retorno {n} bytes (esperado 64)")
    # Esperar el echo del dispositivo (IN endpoint 0x82)
    echo = h.read(64, 500)
    if echo and len(echo) > 0:
        preview = ' '.join(f'{b:02x}' for b in echo[:12])
        print(f"      [IN ] echo: {preview}... ({len(echo)}B)")
        return echo
    return None

def find_kx500():
    devices = hid.enumerate(VID, PID)
    if not devices:
        print(f"ERROR: No se encontró KX-500 (VID={VID:#x}, PID={PID:#x})")
        return None
    print(f"Encontrados {len(devices)} HID device(s):")
    for i, d in enumerate(devices):
        print(f"  [{i}] path: {d['path']}")
        print(f"      usage_page: 0x{d.get('usage_page', 0):04x}")
        print(f"      usage: 0x{d.get('usage', 0):04x}")
    return devices

def main():
    print("=== KX-500 RGB Test via hidapi (v4 - con echo reads + heartbeat) ===\n")

    devices = find_kx500()
    if not devices:
        return 1

    target = None
    for d in devices:
        if d.get('usage_page') == 0xFF1C and d.get('usage') == 0x0092:
            target = d
            break
    if not target:
        target = devices[0]

    print(f"\nAbriendo: {target['path']}\n")
    h = hid.device()
    try:
        h.open_path(target['path'])
    except Exception as e:
        print(f"ERROR abriendo: {e}")
        return 1

    print(f"Manufacturer: {h.get_manufacturer_string()}")
    print(f"Product:      {h.get_product_string()}\n")

    # Limpiar IN reports pendientes primero
    print("[0/4] Limpiando Input Reports pendientes...")
    for _ in range(3):
        data = h.read(64, 100)
        if data:
            print(f"      read() -> {' '.join(f'{b:02x}' for b in data[:8])}...")

    color_idx = 0  # contador de byte2 (varía en cada color change)

    # Test 1: BLUE con flow completo (HB_START + effect_mode + color + HB_END)
    print("\n[1/4] BLUE con flujo USB bulk transfer completo...")
    seq = next_seq()
    write_with_echo(h, padded64(HB_START), "HB_START")
    write_with_echo(h, set_effect_mode(seq), "set effect mode")
    write_with_echo(h, set_color(seq, color_idx, 0x00, 0x00, 0xFF), f"set color BLUE (byte2=0x{color_idx:02x})")
    color_idx += 1
    write_with_echo(h, padded64(HB_END), "HB_END")
    print("      Esperando 2s...")
    time.sleep(2)

    # Test 2: RED
    print("\n[2/4] RED...")
    seq = next_seq()
    write_with_echo(h, padded64(HB_START), "HB_START")
    write_with_echo(h, set_effect_mode(seq), "set effect mode")
    write_with_echo(h, set_color(seq, color_idx, 0xFF, 0x00, 0x00), f"set color RED (byte2=0x{color_idx:02x})")
    color_idx += 1
    write_with_echo(h, padded64(HB_END), "HB_END")
    time.sleep(2)

    # Test 3: GREEN
    print("\n[3/4] GREEN...")
    seq = next_seq()
    write_with_echo(h, padded64(HB_START), "HB_START")
    write_with_echo(h, set_effect_mode(seq), "set effect mode")
    write_with_echo(h, set_color(seq, color_idx, 0x00, 0xFF, 0x00), f"set color GREEN (byte2=0x{color_idx:02x})")
    color_idx += 1
    write_with_echo(h, padded64(HB_END), "HB_END")
    time.sleep(2)

    # Test 4: OFF
    print("\n[4/4] OFF...")
    write_with_echo(h, padded64(HB_START), "HB_START")
    write_with_echo(h, brightness_off(), "brightness OFF")
    write_with_echo(h, padded64(HB_END), "HB_END")

    print("\n=== Test completo ===")
    print("El teclado deberia haber:")
    print("  - Iniciado handshake (sin echo esperado)")
    print("  - Prendido en AZUL (~2s)")
    print("  - Cambiado a ROJO (~2s)")
    print("  - Cambiado a VERDE (~2s)")
    print("  - Apagado al final")
    print("\nSi los colores NO cambiaron:")
    print("  - El driver oficial monopoliza el device (HidServ.exe corre en background)")
    print("  - Cerrá HidServ.exe y CHECKPOINT_KX_500.exe, reintentá")

    h.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
