# -*- coding: utf-8 -*-
"""
test_serialize.py — Diagnostico de timing.

SignalRgbService esta corriendo y tiene el handle HID del KX-500 abierto.
Esto causa conflictos cuando intentamos escribir desde otro proceso.

Opciones:
A) Cerrar SignalRGB primero, ejecutar test
B) Esperar timeouts largos
C) Verificar si el plugin SÍ funciona (revisar log de SignalRGB)
D) Verificar el handle del KX-500 via WinObj/DeviceTree

Este script intenta abrir con SHARING pero NO MONOPOLY, y hacer writes
largos para ver si es timing o monopolio.
"""
import ctypes
import sys
import time
import subprocess
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
    return bytes([0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
                  0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
                  0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
                  0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                  0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
                  0x11, 0x12, 0x14] + [0x00] * 21)


def main():
    print("=" * 78)
    print("  Diagnostico: SignalRgbService monopoliza el KX-500?")
    print("=" * 78)

    # Verificar SignalRgbService
    print("\n[0] Verificando SignalRgbService...")
    try:
        out = subprocess.run(["powershell", "-NoProfile", "-Command",
                              "Get-Process -Name 'SignalRgb*' -ErrorAction SilentlyContinue | Select-Object Name, Id, StartTime | Format-Table -AutoSize"],
                             capture_output=True, text=True, timeout=10)
        print(out.stdout)
    except Exception as e:
        print(f"  [WARN] {e}")

    # Probar abrir el device
    print("\n[1] Abriendo HID device con FILE_SHARE_RW...")
    h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        err = GetLastError()
        print(f"  [FAIL] CreateFileW: err={err}")
        if err == 2:
            print("  Posible: el driver kernel esta monopolizando el dispositivo")
        elif err == 5:
            print("  Posible: otro proceso tiene el handle exclusivo (sin FILE_SHARE_RW)")
        elif err == 32:
            print("  Posible: proceso bloquea el sharing")
        return 1
    print(f"  [OK] handle=0x{h:X}")

    # Hacer UN solo write con delay
    print("\n[2] Enviando UN SOLO handshake (1 write)...")
    b = ctypes.create_string_buffer(build_handshake(), 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    err = GetLastError()
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'} (err={err})")

    time.sleep(1)

    # Otro write con delay
    print("\n[3] Enviando OTRO handshake (1 write) con 1s de delay...")
    b = ctypes.create_string_buffer(build_handshake(), 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(b), 64)
    err = GetLastError()
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'} (err={err})")

    CloseHandle(h)
    print("\n[Done]")
    print("=" * 78)
    print("  Recomendaciones:")
    print("  1. CERRA SignalRGB antes de probar (lo abre en monopolio)")
    print("  2. Ejecuta el plugin de SignalRGB SOLO con el plugin KX-500 cargado")
    print("  3. Verifica los logs de SignalRGB para mas detalle del error 995")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
