# -*- coding: utf-8 -*-
"""
test_long_pauses.py
Diagnostico: el primer write va bien, pero el segundo falla con ERROR_OPERATION_ABORTED.
Hipotesis: el dispositivo se "desconecta" si los writes son muy rapidos.

Voy a hacer 3 writes con pausas LARGAS (500ms cada uno) para ver si el problema
es de timing o de otro motivo.
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


def send(handle, data, label):
    b = ctypes.create_string_buffer(bytes(data), 64)
    ok = HidD_SetOutputReport(handle, ctypes.byref(b), 64)
    err = GetLastError()
    status = "OK" if ok else f"FAIL err={err}"
    print(f"  {label}: {status}")
    return ok


def main():
    print("=" * 78)
    print("  Test con pausas LARGAS (500ms) entre writes")
    print("=" * 78)

    h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        err = GetLastError()
        print(f"  [FAIL] CreateFileW: err={err}")
        return 1
    print(f"  [OK] handle=0x{h:X}")

    handshake = [0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
                 0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
                 0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
                 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
                 0x11, 0x12, 0x14] + [0x00] * 21

    brightness_max = [0x04, 0x0C, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x04] + [0x00] * 55

    solid_blue = [0x04, 0x09, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0x00, 0x00, 0xFF] + [0x00] * 53

    print("\n[1] HANDSHAKE (1 write)...")
    send(h, handshake, "HANDSHAKE")

    print("\n[2] Esperando 500ms...")
    time.sleep(0.5)

    print("\n[3] BRIGHTNESS MAX (1 write, 500ms despues)...")
    ok2 = send(h, brightness_max, "BRIGHTNESS 4")

    print("\n[4] Esperando 500ms...")
    time.sleep(0.5)

    print("\n[5] SOLID COLOR BLUE (1 write, 500ms despues)...")
    ok3 = send(h, solid_blue, "SOLID BLUE")

    print("\n[6] Esperando 500ms...")
    time.sleep(0.5)

    print("\n[7] SOLID COLOR RED (otro write)...")
    send(h, [0x04, 0x0A, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0xFF, 0x00, 0x00] + [0x00] * 53, "SOLID RED")

    print("\n[8] Esperando 500ms...")
    time.sleep(0.5)

    print("\n[9] SOLID COLOR GREEN (otro write)...")
    send(h, [0x04, 0x0B, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0x00, 0xFF, 0x00] + [0x00] * 53, "SOLID GREEN")

    CloseHandle(h)
    print("\n" + "=" * 78)
    if ok2 and ok3:
        print("  Si viste 5 colores diferentes, las pausas largas RESOLVIERON el problema.")
        print("  Eso significa que el plugin v2.0.2 deberia usar pausas mas largas (50-100ms).")
    else:
        print("  Las pausas no resolvieron. El problema es OTRO (endpoint, monopolio, etc.)")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
