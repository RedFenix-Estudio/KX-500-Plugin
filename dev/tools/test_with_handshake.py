# -*- coding: utf-8 -*-
r"""
test_with_handshake.py
======================
Test con handshake completo de 16 paquetes (como HidServ.dll) + solid color via HidD_SetOutputReport.

Si el firmware KX-500 responde al handshake, el Input Report deberia cambiar despues.
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
CreateEventW = kernel32.CreateEventW
CreateEventW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
CreateEventW.restype = wintypes.HANDLE

class OVERLAPPED(ctypes.Structure):
    _fields_ = [("Internal", ctypes.c_void_p), ("InternalHigh", ctypes.c_void_p), ("Offset", wintypes.DWORD), ("OffsetHigh", wintypes.DWORD), ("hEvent", wintypes.HANDLE)]

WriteFile = kernel32.WriteFile
WriteFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
WriteFile.restype = wintypes.BOOLEAN
ReadFile = kernel32.ReadFile
ReadFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
ReadFile.restype = wintypes.BOOLEAN
WaitForSingleObject = kernel32.WaitForSingleObject
WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
WaitForSingleObject.restype = wintypes.DWORD
CancelIo = kernel32.CancelIo
GetOverlappedResult = kernel32.GetOverlappedResult
GetOverlappedResult.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), wintypes.BOOLEAN]
GetOverlappedResult.restype = wintypes.BOOLEAN

HidD_SetOutputReport = hid.HidD_SetOutputReport
HidD_SetOutputReport.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_SetOutputReport.restype = wintypes.BOOLEAN
HidD_GetInputReport = hid.HidD_GetInputReport
HidD_GetInputReport.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_GetInputReport.restype = wintypes.BOOLEAN

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3
FILE_FLAG_OVERLAPPED = 0x40000000
WAIT_TIMEOUT = 0x102
WAIT_OBJECT_0 = 0
ERROR_IO_PENDING = 997

HID_PATH = r"\\?\HID#VID_320F&PID_5008&MI_01&Col04#8&1c1f1d2a&0&0003#{4d1e55b2-f16f-11cf-88cb-001111000030}"


def build_solid_color(r, g, b, seq=0x99, size=64):
    """[0x04] [SEQ] [0x01] [0x06 0x03 0x05 0x00 0x00 R G B] + padding"""
    buf = bytearray(size)
    buf[0] = 0x04
    buf[1] = seq
    buf[2] = 0x01
    buf[3] = 0x06
    buf[4] = 0x03
    buf[5] = 0x05
    buf[6] = 0x00
    buf[7] = 0x00
    buf[8] = r
    buf[9] = g
    buf[10] = b
    return bytes(buf)


def build_handshake_packets():
    """16 paquetes del handshake (visto en USBPcap del driver oficial)."""
    packets = []
    # Paquete 0: handshake inicial
    p0 = bytearray(64)
    # 04 A2 03 04 2C 00 00 00 55 AA FF 02 0F 32 08 50 01 01 00 18 00 00 00 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 14
    data0 = bytes.fromhex("04A203042C00000055AAFF020F32085001010018000000000102030405060708090A0B0C0D0E0F10111214")
    p0[:len(data0)] = data0
    packets.append(bytes(p0))
    # Paquetes 1-15: heartbeat START/END alternados
    for i in range(15):
        p = bytearray(64)
        p[0] = 0x04
        p[1] = 0x01 if i % 2 == 0 else 0x02
        p[2] = 0x00
        p[3] = 0x01 if i % 2 == 0 else 0x02
        packets.append(bytes(p))
    return packets


def send_output_report(handle, data, size, label, timeout_ms=500):
    """Envia un Output Report via HidD_SetOutputReport (sincronico, no overlap)."""
    b = ctypes.create_string_buffer(data, size)
    ok = HidD_SetOutputReport(handle, ctypes.byref(b), size)
    err = GetLastError()
    status = "OK" if ok else f"FAIL err={err}"
    print(f"    {label}: HidD_SetOutputReport {status}")
    return ok


def main():
    color_name = sys.argv[1] if len(sys.argv) > 1 else "red"
    color_map = {
        "red":   (0xFF, 0x00, 0x00), "green": (0x00, 0xFF, 0x00),
        "blue":  (0x00, 0x00, 0xFF), "white": (0xFF, 0xFF, 0xFF),
        "off":   (0x00, 0x00, 0x00), "yellow":(0xFF, 0xFF, 0x00),
        "cyan":  (0x00, 0xFF, 0xFF), "magenta":(0xFF, 0x00, 0xFF),
    }
    r, g, b = color_map.get(color_name.lower(), (0xFF, 0x00, 0x00))
    print("=" * 78)
    print(f"  KX-500 test con HANDSHAKE completo - color {color_name}")
    print("=" * 78)

    # Abrir el device
    print("\n[1] Abriendo HID device...")
    h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        err = GetLastError()
        print(f"  [FAIL] No se pudo abrir. err={err}")
        return 1
    print(f"  [OK] handle=0x{h:X}")

    # Enviar handshake de 16 paquetes
    print("\n[2] Enviando HANDSHAKE de 16 paquetes (via HidD_SetOutputReport)...")
    packets = build_handshake_packets()
    handshake_ok = 0
    for j, p in enumerate(packets):
        ok = send_output_report(h, p, 64, f"Paquete {j:2d}")
        if ok:
            handshake_ok += 1
        time.sleep(0.01)
    print(f"  Handshake: {handshake_ok}/16 paquetes aceptados por el driver")

    # Enviar solid color
    print(f"\n[3] Enviando SOLID COLOR ({color_name}) via HidD_SetOutputReport...")
    out_data = build_solid_color(r, g, b, seq=0x42, size=64)
    ok = send_output_report(h, out_data, 64, "Solid color")
    if ok:
        print(f"  [OK] Verifica si el teclado cambio a {color_name}!")

    # Variantes: probar byte 2 = 0x02 y 0x03 (los 3 formatos que aparecen en las capturas)
    for byte2 in (0x02, 0x03):
        print(f"\n[4] Variante con byte 2 = 0x{byte2:02X}...")
        out_data = bytearray(64)
        out_data[0] = 0x04
        out_data[1] = 0x42
        out_data[2] = byte2
        out_data[3] = 0x06
        out_data[4] = 0x03
        out_data[5] = 0x05
        out_data[6] = 0x00
        out_data[7] = 0x00
        out_data[8] = r
        out_data[9] = g
        out_data[10] = b
        ok = send_output_report(h, bytes(out_data), 64, f"  byte 2=0x{byte2:02X}")
        if ok:
            print(f"  [OK] Enviado!")

    # Test brightness commands
    print(f"\n[5] Probando comando BRIGHTNESS 0 (OFF)...")
    bright_data = bytearray(64)
    bright_data[0] = 0x04
    bright_data[1] = 0x09
    bright_data[2] = 0x00
    bright_data[3] = 0x06
    bright_data[4] = 0x01
    bright_data[5] = 0x01
    ok = send_output_report(h, bytes(bright_data), 64, "Brightness 0")
    if ok:
        print(f"  [OK] Enviado! Esto deberia apagar las luces si el firmware responde.")

    # Test brightness 1
    print(f"\n[6] Probando BRIGHTNESS 1 (bajo)...")
    bright_data[8] = 0x01
    ok = send_output_report(h, bytes(bright_data), 64, "Brightness 1")
    if ok:
        print(f"  [OK] Enviado!")

    # Test solid color de nuevo con seq distinta
    print(f"\n[7] Re-enviar SOLID COLOR {color_name} con seq distinta (0x88)...")
    out_data = build_solid_color(r, g, b, seq=0x88, size=64)
    ok = send_output_report(h, out_data, 64, "Solid color 0x88")
    if ok:
        print(f"  [OK] Enviado!")

    CloseHandle(h)
    print("\n[Done]")
    print("=" * 78)
    print(f"  Resultado esperado: el KX-500 cambia a {color_name}.")
    print(f"  Si HidD_SetOutputReport dio OK, el driver HID recibio el comando.")
    print(f"  Si el firmware responde, deberias ver el cambio visualmente.")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
