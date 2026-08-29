#!/usr/bin/env python3
"""
Test final: probar todas las TLCs y ver cual responde.
Tambien: enviar un RGB command SIN handshake.
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
HidD_GetPreparsedData = hid_dll.HidD_GetPreparsedData
HidD_GetPreparsedData.restype = ctypes.c_bool
HidD_GetPreparsedData.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
HidD_FreePreparsedData = hid_dll.HidD_FreePreparsedData
HidD_FreePreparsedData.restype = ctypes.c_bool
HidD_FreePreparsedData.argtypes = [ctypes.c_void_p]
HidP_GetCaps = hid_dll.HidP_GetCaps
HidP_GetCaps.restype = ctypes.c_ulong
HidP_GetCaps.argtypes = [ctypes.c_void_p, ctypes.c_void_p]

class HIDP_CAPS(ctypes.Structure):
    _fields_ = [
        ("Usage", ctypes.c_ushort),
        ("UsagePage", ctypes.c_ushort),
        ("InputReportByteLength", ctypes.c_ushort),
        ("OutputReportByteLength", ctypes.c_ushort),
        ("FeatureReportByteLength", ctypes.c_ushort),
    ]

HANDSHAKE = bytes([
    0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
    0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
    0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
    0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
    0x11, 0x12, 0x14,
]) + b'\x00' * (64 - 43)

def main():
    print("=== Test: probar TODAS las TLCs ===\n")

    devices = hid.enumerate(0x320F, 0x5008)
    print(f"Encontrados {len(devices)} HID device(s):")
    for i, d in enumerate(devices):
        print(f"  [{i}] interface: {d.get('interface_number')}, usage_page: 0x{d.get('usage_page', 0):04x}, usage: 0x{d.get('usage', 0):04x}")
    print()

    # Probar cada TLC que tenga Output Report byte length > 0
    for i, d in enumerate(devices):
        path = d['path']
        h = CreateFile(path, GENERIC_READ | GENERIC_WRITE, 0x3, None,
                      OPEN_EXISTING, FILE_FLAG_OVERLAPPED, None)
        if h == INVALID_HANDLE_VALUE:
            print(f"[{i}] No se pudo abrir")
            continue

        preparsed = ctypes.c_void_p()
        if not HidD_GetPreparsedData(h, ctypes.byref(preparsed)):
            CloseHandle(h)
            continue

        caps = HIDP_CAPS()
        HidP_GetCaps(preparsed, ctypes.byref(caps))
        HidD_FreePreparsedData(preparsed)

        if caps.OutputReportByteLength == 0:
            print(f"[{i}] interface: {d.get('interface_number')}, usage_page: 0x{d.get('usage_page', 0):04x}, usage: 0x{d.get('usage', 0):04x} -> NO Output Report")
            CloseHandle(h)
            continue

        print(f"\n[{i}] interface: {d.get('interface_number')}, usage_page: 0x{d.get('usage_page', 0):04x}, usage: 0x{d.get('usage', 0):04x}")
        print(f"  Caps: Input={caps.InputReportByteLength}B, Output={caps.OutputReportByteLength}B, Feature={caps.FeatureReportByteLength}B")

        # Probar enviar un color
        color = bytes([0x04, 0x09, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0x00, 0x00, 0xFF]) + b'\x00' * 53
        out_buf = ctypes.create_string_buffer(color, 64)
        ok = HidD_SetOutputReport(h, out_buf, 64)
        err = ctypes.GetLastError() if not ok else 0
        print(f"  HidD_SetOutputReport BLUE: {'OK' if ok else f'FAIL err={err}'}")

        # Probar handshake
        hs_buf = ctypes.create_string_buffer(HANDSHAKE, 64)
        ok = HidD_SetOutputReport(h, hs_buf, 64)
        err = ctypes.GetLastError() if not ok else 0
        print(f"  HidD_SetOutputReport HANDSHAKE: {'OK' if ok else f'FAIL err={err}'}")

        # Probar Input Report
        in_buf = ctypes.create_string_buffer(64)
        in_buf[0] = 0x04
        ok = HidD_GetInputReport(h, in_buf, 64)
        err = ctypes.GetLastError() if not ok else 0
        if ok:
            data = bytes(in_buf.raw[1:64])
            print(f"  HidD_GetInputReport OK: data={data[:16].hex()}")
        else:
            print(f"  HidD_GetInputReport FAIL err={err}")

        CloseHandle(h)

    print("\n=== Conclusion ===")
    print("Si todos los TLCs devuelven los mismos Input Reports y no cambian:")
    print("El firmware del KX-500 esta en 'modo demo' y rechaza TODO write")
    print("Necesitamos encontrar el comando de init correcto")

    return 0

if __name__ == "__main__":
    sys.exit(main())
