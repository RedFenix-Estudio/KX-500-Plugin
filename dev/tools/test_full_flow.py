#!/usr/bin/env python3
"""
Test del KX-500 con el FLUJO COMPLETO:
1. HidD_SetFeature (control transfer) para el handshake de 101 bytes
2. device.write() bulk/interrupt para los RGB commands (64 bytes)

Usa hidapi.enumerate() para encontrar el path (evita el SetupAPI problemático
de ctypes) y ctypes para HidD_SetFeature (hidapi no lo soporta).

El .exe oficial (CHECKPOINT_KX_500.exe) usa DeviceIoControl que internamente
hace lo mismo que HidD_SetFeature. Verificado en python_analysis/installed_imports.txt.
"""
import sys
import time
import ctypes

try:
    import hid
except ImportError:
    print("ERROR: hidapi no instalado.")
    print("Instalar con: pip install hidapi")
    sys.exit(1)

# Cargar hid.dll de Windows
hid_dll = ctypes.WinDLL("hid.dll")

# Prototipos
HidD_SetFeature = hid_dll.HidD_SetFeature
HidD_SetFeature.restype = ctypes.c_bool
HidD_SetFeature.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]

HidD_GetFeature = hid_dll.HidD_GetFeature
HidD_GetFeature.restype = ctypes.c_bool
HidD_GetFeature.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]

# kernel32
kernel32 = ctypes.WinDLL("kernel32.dll")
CreateFile = kernel32.CreateFileA
CreateFile.restype = ctypes.c_void_p
GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
OPEN_EXISTING = 3
INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value

CloseHandle = kernel32.CloseHandle
WriteFile = kernel32.WriteFile
WriteFile.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong,
                     ctypes.POINTER(ctypes.c_ulong), ctypes.c_void_p]
WriteFile.restype = ctypes.c_bool

ReadFile = kernel32.ReadFile
ReadFile.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong,
                    ctypes.POINTER(ctypes.c_ulong), ctypes.c_void_p]
ReadFile.restype = ctypes.c_bool

# Handshake: 64 bytes vistos en USBPcap + 37 bytes de padding
HANDSHAKE_64 = bytes([
    0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
    0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
    0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
    0x11, 0x12, 0x14,
])

def main():
    print("=== KX-500 Test: HidD_SetFeature (handshake) + WriteFile (RGB) ===\n")

    # 1. Encontrar el KX-500 via hidapi
    devices = hid.enumerate(0x320F, 0x5008)
    print(f"Encontrados {len(devices)} HID device(s) matching KX-500:")
    for i, d in enumerate(devices):
        print(f"  [{i}] path: {d['path']}")
        print(f"      interface: {d.get('interface_number')}, usage_page: 0x{d.get('usage_page', 0):04x}, usage: 0x{d.get('usage', 0):04x}")
    print()

    # Buscar el endpoint FF1C:0092 (RGB)
    target = None
    for d in devices:
        if d.get('usage_page') == 0xFF1C and d.get('usage') == 0x0092:
            target = d
            break
    if not target:
        if devices:
            target = devices[0]
        else:
            print("ERROR: KX-500 no encontrado")
            return 1

    path = target['path']
    # hidapi devuelve bytes, CreateFileA acepta bytes directamente
    if isinstance(path, bytes):
        path_str = path.decode("ascii")
    else:
        path_str = path
    print(f"Target path: {path_str}\n")

    # 2. Abrir con CreateFile (acceso total read+write) via ctypes
    h = CreateFile(path,
                  GENERIC_READ | GENERIC_WRITE,
                  0x3,  # FILE_SHARE_READ | FILE_SHARE_WRITE
                  None, OPEN_EXISTING, 0, None)
    if h == INVALID_HANDLE_VALUE:
        err = ctypes.GetLastError()
        print(f"ERROR: CreateFile fallo con error {err}")
        return 1
    print(f"Windows handle: 0x{h:X}\n")

    # 3. Test HidD_SetFeature con el handshake
    print("=== Probando HidD_SetFeature (handshake, control transfer) ===\n")
    for hs_size in [101, 64, 43, 65]:
        hs_bytes = HANDSHAKE_64 + b'\x00' * (hs_size - 64) if hs_size > 64 else HANDSHAKE_64[:hs_size]
        buf = ctypes.create_string_buffer(hs_bytes, hs_size)
        ok = HidD_SetFeature(h, buf, hs_size)
        err = ctypes.GetLastError() if not ok else 0
        status = "OK" if ok else f"FAIL (err={err}={self_err_name(err)})"
        print(f"  HidD_SetFeature(h, buf, {hs_size}): {status}")
        if ok:
            print(f"\n  >>> EL KX-500 ACEPTA FEATURE REPORTS <<<")
            break

    if not ok:
        print("\n  >>> El KX-500 NO soporta Feature Reports <<<")
        print("  Error comun: 1=ERROR_INVALID_FUNCTION (no hay Feature Report en el descriptor)")
        print("  El handshake va por otro mecanismo (probablemente interrupt OUT)")
        CloseHandle(h)
        return 1

    # 4. Si HidD_SetFeature funciono, intentar WriteFile
    print("\n=== Probando WriteFile (RGB commands, interrupt OUT) ===\n")

    def write_out(data, label):
        assert len(data) == 64, f"packet debe ser 64B, tiene {len(data)}"
        buf = ctypes.create_string_buffer(data, 64)
        written = ctypes.c_ulong(0)
        ok = WriteFile(h, buf, 64, ctypes.byref(written), None)
        err = ctypes.GetLastError() if not ok else 0
        status = "OK" if ok else f"FAIL (err={err})"
        preview = ' '.join(f'{b:02x}' for b in data[:8])
        print(f"  [OUT] {label}: {preview}... -> {status}")
        time.sleep(0.05)
        return ok

    def read_in(timeout_ms=200):
        """Lee IN del dispositivo (USB bulk/control transfer echo)."""
        buf = ctypes.create_string_buffer(64)
        read = ctypes.c_ulong(0)
        ok = ReadFile(h, buf, 64, ctypes.byref(read), None)
        if ok and read.value > 0:
            preview = ' '.join(f'{b:02x}' for b in buf.raw[:8])
            print(f"  [IN ] read {read.value}B: {preview}...")
            return bytes(buf.raw[:read.value])
        return None

    _seq = [0x08]
    def next_seq():
        s = _seq[0]
        _seq[0] = (_seq[0] + 1) & 0xFF
        return s

    # 5. Test color BLUE
    print("\n[1/3] Mandando BLUE con flow completo (HB_START + effect + color + HB_END)...")
    write_out(bytes([0x04, 0x01, 0x00, 0x01]) + b'\x00' * 60, "HB_START")
    read_in()
    seq = next_seq()
    write_out(bytes([0x04, seq, 0x00, 0x06, 0x01, 0x04, 0x00, 0x00, 0x00]) + b'\x00' * 55, "set effect mode")
    read_in()
    seq = next_seq()
    write_out(bytes([0x04, seq, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0x00, 0x00, 0xFF]) + b'\x00' * 53, "set color BLUE (byte2=0x01)")
    read_in()
    write_out(bytes([0x04, 0x02, 0x00, 0x02]) + b'\x00' * 60, "HB_END")
    read_in()
    print("  Esperando 2s para ver BLUE...")
    time.sleep(2)

    # 6. Test color RED
    print("\n[2/3] Mandando RED...")
    write_out(bytes([0x04, 0x01, 0x00, 0x01]) + b'\x00' * 60, "HB_START")
    read_in()
    seq = next_seq()
    write_out(bytes([0x04, seq, 0x00, 0x06, 0x01, 0x04, 0x00, 0x00, 0x00]) + b'\x00' * 55, "set effect mode")
    read_in()
    seq = next_seq()
    write_out(bytes([0x04, seq, 0x02, 0x06, 0x03, 0x05, 0x00, 0x00, 0xFF, 0x00, 0x00]) + b'\x00' * 53, "set color RED (byte2=0x02)")
    read_in()
    write_out(bytes([0x04, 0x02, 0x00, 0x02]) + b'\x00' * 60, "HB_END")
    read_in()
    time.sleep(2)

    # 7. Test OFF
    print("\n[3/3] Mandando OFF (brightness 0)...")
    write_out(bytes([0x04, 0x01, 0x00, 0x01]) + b'\x00' * 60, "HB_START")
    read_in()
    write_out(bytes([0x04, 0x08, 0x00, 0x06, 0x01, 0x01]) + b'\x00' * 58, "brightness OFF")
    read_in()
    write_out(bytes([0x04, 0x02, 0x00, 0x02]) + b'\x00' * 60, "HB_END")
    read_in()

    print("\n=== Test completo ===")
    print("Si todo OK: el teclado deberia haber cambiado a BLUE -> RED -> OFF")
    print("Si HidD_SetFeature dio error 1 (ERROR_INVALID_FUNCTION):")
    print("  El KX-500 no soporta Feature Reports. El handshake va por OTRO mecanismo.")

    CloseHandle(h)
    return 0

def self_err_name(err):
    """Mapea error code a nombre legible."""
    names = {
        1: "ERROR_INVALID_FUNCTION",
        5: "ERROR_ACCESS_DENIED",
        6: "ERROR_INVALID_HANDLE",
        0x57: "ERROR_INVALID_PARAMETER",
        0x1F: "ERROR_NOT_SUPPORTED",
    }
    return names.get(err, f"err=0x{err:X}")

if __name__ == "__main__":
    sys.exit(main())
