"""check_processes.py - Verifica qué procesos tienen el KX-500 abierto y fuerza la apertura."""
import ctypes
import subprocess
import sys
import os
from ctypes import wintypes

kernel32 = ctypes.WinDLL("kernel32")
cfgmgr32 = ctypes.WinDLL("cfgmgr32")

CreateFileW = kernel32.CreateFileW
CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
CreateFileW.restype = wintypes.HANDLE
CloseHandle = kernel32.CloseHandle
GetLastError = kernel32.GetLastError
INVALID_HANDLE_VALUE = -1  # Python signed int

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3

def h2s(h):
    if h is None or h == INVALID_HANDLE_VALUE or h == 0xFFFFFFFFFFFFFFFF or h == 0xFFFFFFFF:
        return "INVALID"
    return f"0x{h:016X}"

# Lista de procesos
print("=" * 80)
print("Procesos sospechosos que podrian monopolizar el KX-500:")
print("=" * 80)
suspect_patterns = ["kx", "checkpoint", "favorit", "fwcustom", "hidserv", "signalrgb", "whirlwind", "fx", "rgb"]
try:
    out = subprocess.run(["tasklist", "/v", "/fo", "csv"], capture_output=True, text=True, timeout=15)
    for line in out.stdout.splitlines()[1:]:
        parts = line.replace('"', '').split(',')
        if len(parts) > 0:
            name = parts[0].lower()
            if any(p in name for p in suspect_patterns):
                print(f"  {parts[0]:50s} PID={parts[1] if len(parts) > 1 else '?'}")
except Exception as e:
    print(f"  tasklist fallo: {e}")

print()
print("=" * 80)
print("Probando apertura EXCLUSIVA vs COMPARTIDA del KX-500")
print("=" * 80)
# Path HID del KX-500 (Col04)
path = r"\\?\HID#VID_320F&PID_5008&MI_01&Col04#8&1c1f1d2a&0&0003#{4d1e55b2-f16f-11cf-88cb-001111000030}"

# Probar con GENERIC_READ solamente
h = CreateFileW(path, GENERIC_READ, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
err = GetLastError()
print(f"  [GENERIC_READ only]         handle={h2s(h)} err={err}")
if h != INVALID_HANDLE_VALUE and h > 0:
    CloseHandle(h)

# Probar con GENERIC_READ | GENERIC_WRITE
h = CreateFileW(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
err = GetLastError()
print(f"  [GENERIC_READ|GENERIC_WRITE] handle={h2s(h)} err={err}")
if h != INVALID_HANDLE_VALUE and h > 0:
    CloseHandle(h)

# Probar con FILE_SHARE_READ pero NO FILE_SHARE_WRITE
h = CreateFileW(path, GENERIC_READ | GENERIC_WRITE, 0x1, None, OPEN_EXISTING, 0, None)
err = GetLastError()
print(f"  [SHARE=READ only]           handle={h2s(h)} err={err}")
if h != INVALID_HANDLE_VALUE and h > 0:
    CloseHandle(h)

# Probar sin compartir nada
h = CreateFileW(path, GENERIC_READ | GENERIC_WRITE, 0, None, OPEN_EXISTING, 0, None)
err = GetLastError()
print(f"  [SHARE=0]                   handle={h2s(h)} err={err}")
if h != INVALID_HANDLE_VALUE and h > 0:
    CloseHandle(h)

print()
print("=" * 80)
print("Probando con el path de la collection 01 (BIOS keyboard):")
print("=" * 80)
path2 = r"\\?\HID#VID_320F&PID_5008&MI_01&Col01#8&1c1f1d2a&0&0000#{884b96c3-56ef-11d1-bc8c-00a0c91405dd}"
h = CreateFileW(path2, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
err = GetLastError()
print(f"  handle={h2s(h)} err={err}")
if h != INVALID_HANDLE_VALUE and h > 0:
    CloseHandle(h)

# Intentar abrir en modo EXCLUSIVE
print()
print("=" * 80)
print("Usando CreateFileW con FILE_FLAG_NO_BUFFERING (0x20000000) y OVERLAPPED (0x40000000)")
print("=" * 80)
h = CreateFileW(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0x60000000, None)
err = GetLastError()
print(f"  handle={h2s(h)} err={err}")
if h != INVALID_HANDLE_VALUE and h > 0:
    CloseHandle(h)
