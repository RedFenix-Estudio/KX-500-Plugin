# -*- coding: utf-8 -*-
r"""
test_exact_plugin.py
====================
Replica EXACTAMENTE lo que hace el plugin SignalRGB v2.0.0 (KX500_Plugin.js)
para aislar por que no funciona.

El plugin:
  1. device.set_endpoint(0x03)  -- fuerza endpoint 0x03 OUT
  2. device.write(HANDSHAKE)    -- 1 paquete, 64B
  3. device.pause(10)
  4. device.write(buildBrightness(4))  -- brightness MAX
  5. device.pause(10)
  6. device.write(buildSolidColor(0, 0, 0xFF, seq))  -- test blue
"""
import ctypes
import sys
import time
from ctypes import wintypes

kernel32 = ctypes.WinDLL("kernel32")
hid = ctypes.WinDLL("hid.dll")

CreateFileW = kernel32.CreateFileW
CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
CreateFileW.restype = wintypes.HANDLE
WriteFile = kernel32.WriteFile
CloseHandle = kernel32.CloseHandle
GetLastError = kernel32.GetLastError

HidD_SetOutputReport = hid.HidD_SetOutputReport
HidD_SetOutputReport.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_SetOutputReport.restype = wintypes.BOOLEAN

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3

HID_PATH = r"\\?\HID#VID_320F&PID_5008&MI_01&Col04#8&1c1f1d2a&0&0003#{4d1e55b2-f16f-11cf-88cb-001111000030}"


def build_handshake():
    """Replica EXACTA del HANDSHAKE del plugin (43 bytes + 21 zeros)."""
    return [
        0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
        0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
        0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
        0x11, 0x12, 0x14,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
    ]


def build_brightness_max():
    return [0x04, 0x0C, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x04]


def build_solid_color(r, g, b, seq=0x09):
    return [0x04, seq, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, r, g, b]


def pad64(arr):
    out = list(arr)
    while len(out) < 64:
        out.append(0x00)
    return out[:64]


def send(handle, packet, label):
    b = ctypes.create_string_buffer(bytes(packet), 64)
    ok = HidD_SetOutputReport(handle, ctypes.byref(b), 64)
    err = GetLastError()
    status = "OK" if ok else f"FAIL err={err}"
    print(f"    {label}: {status}")
    return ok


def main():
    print("=" * 78)
    print("  Test EXACTO del plugin v2.0.0 (sin set_endpoint)")
    print("  Replicando: HANDSHAKE + brightness + solid color (blue)")
    print("=" * 78)

    h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        err = GetLastError()
        print(f"  [FAIL] No se pudo abrir. err={err}")
        return 1
    print(f"  [OK] handle=0x{h:X}")

    print("\n  [1] Handshake (1 paquete, igual al plugin)...")
    send(h, build_handshake(), "HANDSHAKE")
    time.sleep(0.01)

    print("\n  [2] Brightness MAX (level 4)...")
    send(h, build_brightness_max(), "BRIGHTNESS 4")
    time.sleep(0.01)

    print("\n  [3] Solid color BLUE (test)...")
    send(h, build_solid_color(0, 0, 0xFF, 0x09), "SOLID BLUE")

    print("\n  [4] Solid color RED...")
    send(h, build_solid_color(0xFF, 0, 0, 0x0A), "SOLID RED")

    print("\n  [5] Solid color GREEN...")
    send(h, build_solid_color(0, 0xFF, 0, 0x0B), "SOLID GREEN")

    print("\n  [6] Brightness 1 (bajo)...")
    send(h, [0x04, 0x09, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x01], "BRIGHTNESS 1")

    print("\n  [7] Brightness 0 (off)...")
    send(h, [0x04, 0x08, 0x00, 0x06, 0x01, 0x01], "BRIGHTNESS 0 (OFF)")

    print("\n  [8] Brightness 4 (max)...")
    send(h, [0x04, 0x0C, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x04], "BRIGHTNESS 4 (MAX)")

    print("\n  [9] Solid color WHITE final...")
    send(h, build_solid_color(0xFF, 0xFF, 0xFF, 0x10), "SOLID WHITE")

    CloseHandle(h)
    print("\n" + "=" * 78)
    print("  Verifica si el teclado cambio a blanco.")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
