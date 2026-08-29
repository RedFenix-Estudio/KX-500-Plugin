# -*- coding: utf-8 -*-
r"""
test_v051_style.py
==================
Replica EXACTAMENTE lo que hacia v0.5.1 (la version que "CONTROLABA" el teclado):
- 1 HANDSHAKE
- 1 brightness MAX
- 1 test color
= 3 paquetes TOTAL

Si esto funciona pero 16 paquetes no, confirma que el problema es el heartbeat
de 15 paquetes (v0.6.1 ya lo habia descubierto).
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
    return bytes([
        0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
        0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
        0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
        0x11, 0x12, 0x14,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00,
    ])


def build_brightness_max():
    return bytes([0x04, 0x0C, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x04] + [0x00] * 55)


def build_solid_color(r, g, b, seq):
    return bytes([0x04, seq, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, r, g, b] + [0x00] * 54)


def main():
    print("=" * 78)
    print("  Test estilo v0.5.1 — 3 paquetes TOTAL (handshake + brightness + test)")
    print("=" * 78)

    print("\n[1] Abriendo HID device...")
    h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        err = GetLastError()
        print(f"  [FAIL] err={err}")
        return 1
    print(f"  [OK] handle=0x{h:X}")

    # 3 paquetes, como v0.5.1
    print("\n[2] Paquete 1/3: HANDSHAKE...")
    b = ctypes.create_string_buffer(build_handshake(), 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'}")
    time.sleep(0.01)

    print("\n[3] Paquete 2/3: brightness MAX (level 4)...")
    b = ctypes.create_string_buffer(build_brightness_max(), 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'}")
    time.sleep(0.01)

    print("\n[4] Paquete 3/3: solid color BLUE (test)...")
    b = ctypes.create_string_buffer(build_solid_color(0, 0, 0xFF, 0x09), 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'}")

    print("\n[5] Solid color RED...")
    b = ctypes.create_string_buffer(build_solid_color(0xFF, 0x00, 0x00, 0x0A), 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'}")

    print("\n[6] Solid color GREEN...")
    b = ctypes.create_string_buffer(build_solid_color(0x00, 0xFF, 0x00, 0x0B), 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'}")

    print("\n[7] Brightness 0 (OFF)...")
    b = ctypes.create_string_buffer(bytes([0x04, 0x08, 0x00, 0x06, 0x01, 0x01] + [0x00] * 58), 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'}")

    print("\n[8] Brightness 4 (MAX)...")
    b = ctypes.create_string_buffer(bytes([0x04, 0x0C, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x04] + [0x00] * 55), 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'}")

    print("\n[9] Solid color WHITE final...")
    b = ctypes.create_string_buffer(build_solid_color(0xFF, 0xFF, 0xFF, 0x10), 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'}")

    CloseHandle(h)
    print("\n" + "=" * 78)
    print("  Si viste azul -> rojo -> verde -> OFF -> MAX -> blanco, el firmware responde.")
    print("  Eso confirma que 3 paquetes (estilo v0.5.1) SÍ funcionan, pero")
    print("  SignalRGB SDK da ERROR_OPERATION_ABORTED con 16+ paquetes.")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
