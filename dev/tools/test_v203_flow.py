# -*- coding: utf-8 -*-
"""
test_v203_flow.py
Replica EXACTA del plugin v2.0.3:
  Initialize():
    1. HANDSHAKE
    2. pause 100ms
    3. brightness MAX
    4. pause 100ms
    5. test color blue
    6. pause 100ms
  Render() (3x):
    solid color rojo
    pause 5ms
    solid color verde
    pause 5ms
    solid color azul
    pause 5ms
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


def pad64(arr):
    out = list(arr) + [0x00] * 64
    return bytes(out[:64])


def main():
    print("=" * 78)
    print("  Test v2.0.3 — flow EXACTO del plugin SignalRGB")
    print("  Initialize (pause 100ms) + Render (pause 5ms)")
    print("=" * 78)

    h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        err = GetLastError()
        print(f"  [FAIL] CreateFileW: err={err}")
        return 1
    print(f"  [OK] handle=0x{h:X}")

    def send(data, label):
        b = ctypes.create_string_buffer(data, 64)
        ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
        err = GetLastError()
        status = "OK" if ok else f"FAIL err={err}"
        print(f"    {label}: {status}")
        return ok

    # ==== Initialize (3 writes con 100ms entre cada uno) ====
    print("\n[1/3] HANDSHAKE (Initialize)...")
    hs = pad64([0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
                0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
                0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
                0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
                0x11, 0x12, 0x14])
    send(hs, "HANDSHAKE")
    time.sleep(0.1)  # 100ms

    print("\n[2/3] BRIGHTNESS MAX (Initialize, +100ms)...")
    br = pad64([0x04, 0x0C, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x04])
    send(br, "BRIGHTNESS 4")
    time.sleep(0.1)  # 100ms

    print("\n[3/3] TEST COLOR BLUE (Initialize, +100ms)...")
    sc = pad64([0x04, 0x09, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0x00, 0x00, 0xFF])
    send(sc, "SOLID BLUE")
    time.sleep(0.1)  # 100ms

    # ==== Render (3 writes con 5ms entre cada uno) ====
    print("\n[Render #1] SOLID RED (+5ms)...")
    send(pad64([0x04, 0x0A, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0xFF, 0x00, 0x00]), "SOLID RED")
    time.sleep(0.005)

    print("\n[Render #2] SOLID GREEN (+5ms)...")
    send(pad64([0x04, 0x0B, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0x00, 0xFF, 0x00]), "SOLID GREEN")
    time.sleep(0.005)

    print("\n[Render #3] SOLID WHITE (+5ms)...")
    send(pad64([0x04, 0x0C, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, 0xFF, 0xFF, 0xFF]), "SOLID WHITE")

    CloseHandle(h)
    print("\n" + "=" * 78)
    print("  Si viste: HANDSHAKE + BRIGHTNESS + BLUE + RED + GREEN + WHITE,")
    print("  el flow del plugin v2.0.3 funciona correctamente.")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
