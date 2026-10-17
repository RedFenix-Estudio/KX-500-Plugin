# -*- coding: utf-8 -*-
"""
test_handshake_reset.py
=======================
HIPOTESIS: el paquete HANDSHAKE provoca una re-enumeracion USB del KX-500,
que invalida el handle HID. Por eso en SignalRGB:

    write(handshake)  -> ERROR_IO_PENDING (0x3E5)   [nunca completa]
    write(brightness) -> ERROR_OPERATION_ABORTED (0x3E3)
    -> "Device Hid Handle is no longer connected! 995"
    -> "Regenerating Hid Handles..."

Si es cierto, el color SOLO funciona si:
    1. se envia el handshake
    2. se espera la re-enumeracion
    3. se ABRE UN HANDLE NUEVO
    4. recien ahi se envia el color

Este test mide exactamente eso.
"""
import ctypes
import sys
import time
from ctypes import wintypes

kernel32 = ctypes.WinDLL("kernel32")
hid = ctypes.WinDLL("hid.dll")

CreateFileW = kernel32.CreateFileW
CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                        wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
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

HANDSHAKE = bytes([0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
                   0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
                   0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
                   0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                   0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
                   0x11, 0x12, 0x14] + [0x00] * 21)


def open_hid():
    h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        return None, GetLastError()
    return h, 0


def send(h, payload, label):
    b = ctypes.create_string_buffer(payload, 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    err = GetLastError()
    print(f"    {label:<46} {'OK' if ok else f'FAIL err={err}'}")
    return ok


def solid(r, g, b, seq):
    return bytes([0x04, seq, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, r, g, b] + [0x00] * 53)


def main():
    print("=" * 92)
    print("  TEST: el HANDSHAKE invalida el handle?")
    print("=" * 92)

    # ── Escenario A: TODO con el mismo handle (lo que hace el plugin) ──
    print("\n[A] Escenario A — un solo handle para todo (como el plugin actual)")
    h, err = open_hid()
    if not h:
        print(f"    [FAIL] no se pudo abrir err={err}")
        return 1
    print(f"    handle inicial = 0x{h:X}")
    send(h, HANDSHAKE, "1. HANDSHAKE")
    send(h, bytes([0x04, 0x0C, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x04] + [0] * 55), "2. BRIGHTNESS 4 (mismo handle)")
    send(h, solid(0xFF, 0x00, 0x00, 0x09), "3. SOLID ROJO (mismo handle)")
    send(h, solid(0x00, 0xFF, 0x00, 0x0A), "4. SOLID VERDE (mismo handle)")
    CloseHandle(h)

    time.sleep(2)

    # ── Escenario B: handshake, esperar, REABRIR, luego color ──
    print("\n[B] Escenario B — handshake, esperar 2s, REABRIR handle, luego color")
    h, err = open_hid()
    if not h:
        print(f"    [FAIL] no se pudo abrir err={err}")
        return 1
    print(f"    handle inicial = 0x{h:X}")
    send(h, HANDSHAKE, "1. HANDSHAKE")
    CloseHandle(h)
    print("    (handle cerrado, esperando 2s a la re-enumeracion...)")
    time.sleep(2)

    h2, err = open_hid()
    if not h2:
        print(f"    [FAIL] no se pudo reabrir err={err}")
        return 1
    print(f"    handle NUEVO = 0x{h2:X}")
    send(h2, bytes([0x04, 0x0C, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x04] + [0] * 55), "2. BRIGHTNESS 4 (handle nuevo)")
    send(h2, bytes([0x04, 0x08, 0x00, 0x06, 0x01, 0x00, 0x00, 0x00, 0x01] + [0] * 55), "3. EFECTO #1 (handle nuevo)")
    send(h2, solid(0xFF, 0x00, 0x00, 0x09), "4. SOLID ROJO (handle nuevo)")
    send(h2, solid(0x00, 0xFF, 0x00, 0x0A), "5. SOLID VERDE (handle nuevo)")
    send(h2, solid(0x00, 0x00, 0xFF, 0x0B), "6. SOLID AZUL (handle nuevo)")
    CloseHandle(h2)

    # ── Escenario C: SIN handshake ──
    time.sleep(1)
    print("\n[C] Escenario C — SIN handshake, directo al color")
    h3, err = open_hid()
    if not h3:
        print(f"    [FAIL] no se pudo abrir err={err}")
        return 1
    print(f"    handle = 0x{h3:X}")
    send(h3, bytes([0x04, 0x0C, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x04] + [0] * 55), "1. BRIGHTNESS 4")
    send(h3, bytes([0x04, 0x08, 0x00, 0x06, 0x01, 0x00, 0x00, 0x00, 0x01] + [0] * 55), "2. EFECTO #1")
    send(h3, solid(0xFF, 0x00, 0x00, 0x09), "3. SOLID ROJO")
    send(h3, solid(0x00, 0xFF, 0x00, 0x0A), "4. SOLID VERDE")
    CloseHandle(h3)

    print()
    print("=" * 92)
    print("  INTERPRETACION")
    print("=" * 92)
    print("  Si [A] falla y [B] funciona -> el handshake invalida el handle.")
    print("     FIX: el plugin no debe mandar el handshake por el mismo handle,")
    print("     o debe tolerar la regeneracion de handles de SignalRGB.")
    print("  Si los tres funcionan -> el problema no es el handshake.")
    print("     Volver a medir timing con SignalRGB corriendo.")
    print("=" * 92)
    return 0


if __name__ == "__main__":
    sys.exit(main())