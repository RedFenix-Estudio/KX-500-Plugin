#!/usr/bin/env python3
"""
Test del KX-500 con el flow COMPLETO del driver oficial:
- HidD_SetOutputReport para escribir
- HidD_GetInputReport para leer echoes
- Secuencia: handshake + HB_START + CMD + HB_END

El driver oficial usa este patron con echo reads entre cada write.
v0.5.1 del plugin (que el usuario dice que tomaba control) usaba HB_START
+ CMD + HB_END. v0.6.1 lo quito por error y nunca lo restauro.
"""
import sys
import time
import ctypes

try:
    import hid
except ImportError:
    print("ERROR: pip install hidapi")
    sys.exit(1)

kernel32 = ctypes.WinDLL("kernel32.dll")
CreateFile = kernel32.CreateFileA
CreateFile.restype = ctypes.c_void_p
GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
OPEN_EXISTING = 3
FILE_FLAG_OVERLAPPED = 0x40000000
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value
CloseHandle = kernel32.CloseHandle

hid_dll = ctypes.WinDLL("hid.dll")
HidD_SetOutputReport = hid_dll.HidD_SetOutputReport
HidD_SetOutputReport.restype = ctypes.c_bool
HidD_SetOutputReport.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
HidD_GetInputReport = hid_dll.HidD_GetInputReport
HidD_GetInputReport.restype = ctypes.c_bool
HidD_GetInputReport.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]

# Bytes confirmados por capturas del driver oficial
HANDSHAKE = bytes([
    0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
    0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
    0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
    0x11, 0x12, 0x14,
]) + b'\x00' * (64 - 43)

HB_START = bytes([0x04, 0x01, 0x00, 0x01]) + b'\x00' * 60
HB_END = bytes([0x04, 0x02, 0x00, 0x02]) + b'\x00' * 60

def read_in(h, label=""):
    """Lee Input Report con Report ID 0x04. Devuelve (ok, data)."""
    in_buf = ctypes.create_string_buffer(64)
    in_buf[0] = 0x04
    ok = HidD_GetInputReport(h, in_buf, 64)
    if ok:
        data = bytes(in_buf.raw[:64])
        # Quitar Report ID, mostrar primeros 12 bytes
        content = data[1:13]
        preview = ' '.join(f'{b:02x}' for b in content)
        print(f"  [IN ] {label}: {preview}...")
        return True, data
    return False, None

def write_out(h, data, label):
    """Escribe Output Report con Report ID 0x04."""
    assert data[0] == 0x04
    out_buf = ctypes.create_string_buffer(data, 64)
    ok = HidD_SetOutputReport(h, out_buf, 64)
    err = ctypes.GetLastError() if not ok else 0
    if ok:
        preview = ' '.join(f'{b:02x}' for b in data[:8])
        print(f"  [OUT] {label}: {preview}... OK")
    else:
        print(f"  [OUT] {label}: FAIL err={err}")
    return ok

def main():
    print("=== KX-500 Test: heartbeat + read echoes (flow del driver oficial) ===\n")

    devices = hid.enumerate(0x320F, 0x5008)
    target = None
    for d in devices:
        if d.get('usage_page') == 0xFF1C and d.get('usage') == 0x0092:
            target = d
            break
    if not target:
        target = devices[0]

    path = target['path']
    print(f"Abriendo TLC FF1C:0092 (RGB)\n")

    h = CreateFile(path, GENERIC_READ | GENERIC_WRITE, 0x3, None, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, None)
    if h == INVALID_HANDLE_VALUE:
        print(f"CreateFile fallo: {ctypes.GetLastError()}")
        return 1
    print(f"Handle: 0x{h:X}\n")

    # Paso 0: leer Input Report INICIAL
    print("[0/8] Input Report INICIAL (estado del firmware)...")
    ok, initial = read_in(h, "inicial")
    if not ok:
        print("  (no se pudo leer)")

    # Paso 1: handshake
    print("\n[1/8] HANDSHAKE...")
    write_out(h, HANDSHAKE, "handshake")
    time.sleep(0.05)
    read_in(h, "post-handshake echo")

    # Paso 2-7: secuencia HB_START + effect_mode + color + HB_END, con echo reads
    print("\n[2/8] HB_START (04 01 00 01)...")
    write_out(h, HB_START, "HB_START")
    time.sleep(0.05)
    read_in(h, "post-HB_START echo")

    print("\n[3/8] set effect mode (04 0b 00 06 01 04 00 00 00)...")
    eff = bytes([0x04, 0x0b, 0x00, 0x06, 0x01, 0x04, 0x00, 0x00, 0x00]) + b'\x00' * 55
    write_out(h, eff, "set effect mode")
    time.sleep(0.05)
    read_in(h, "post-effect-mode echo")

    print("\n[4/8] set color BLUE (04 09 01 06 03 05 00 00 00 00 FF)...")
    color = bytes([0x04, 0x09, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0x00, 0x00, 0xFF]) + b'\x00' * 53
    write_out(h, color, "set color BLUE")
    time.sleep(0.05)
    read_in(h, "post-color echo")

    print("\n[5/8] HB_END (04 02 00 02)...")
    write_out(h, HB_END, "HB_END")
    time.sleep(0.05)
    read_in(h, "post-HB_END echo")

    print("\n[6/8] Esperando 2s para ver BLUE...")
    time.sleep(2)
    read_in(h, "final (2s)")

    # Paso 7-8: RED
    print("\n[7/8] RED...")
    write_out(h, HB_START, "HB_START")
    time.sleep(0.05)
    read_in(h, "echo")
    write_out(h, eff, "set effect mode")
    time.sleep(0.05)
    read_in(h, "echo")
    color_red = bytes([0x04, 0x0a, 0x02, 0x06, 0x03, 0x05, 0x00, 0x00, 0xFF, 0x00, 0x00]) + b'\x00' * 53
    write_out(h, color_red, "set color RED (byte2=0x02)")
    time.sleep(0.05)
    read_in(h, "echo")
    write_out(h, HB_END, "HB_END")
    time.sleep(0.05)
    read_in(h, "echo")
    time.sleep(2)

    # Paso 9-12: OFF
    print("\n[8/8] OFF (brightness 0)...")
    write_out(h, HB_START, "HB_START")
    time.sleep(0.05)
    read_in(h, "echo")
    brightness_off = bytes([0x04, 0x08, 0x00, 0x06, 0x01, 0x01]) + b'\x00' * 58
    write_out(h, brightness_off, "brightness OFF")
    time.sleep(0.05)
    read_in(h, "echo")
    write_out(h, HB_END, "HB_END")
    time.sleep(0.05)
    read_in(h, "echo")

    # Comparación
    print("\n=== Verificacion ===")
    if initial is not None:
        final_buf = ctypes.create_string_buffer(64)
        final_buf[0] = 0x04
        if HidD_GetInputReport(h, final_buf, 64):
            final = bytes(final_buf.raw[:64])
            if final[1:] != initial[1:]:
                print("  >>> Input Report CAMBIO! El firmware ESTA respondiendo <<<")
                print(f"  Antes: {initial[1:8].hex()}")
                print(f"  Despues: {final[1:8].hex()}")
            else:
                print("  Input Report IGUAL. El firmware NO esta respondiendo.")

    CloseHandle(h)
    return 0

if __name__ == "__main__":
    sys.exit(main())
