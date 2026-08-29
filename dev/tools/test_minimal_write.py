# -*- coding: utf-8 -*-
r"""
test_minimal_write.py
=====================
Test minimalista robusto con OVERLAPPED I/O y timeouts.
Abre el KX-500 y envia UN SOLO paquete via WriteFile (Output Report) y HidD_SetFeature.
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
WriteFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
WriteFile.restype = wintypes.BOOLEAN
CloseHandle = kernel32.CloseHandle
GetLastError = kernel32.GetLastError
CancelIo = kernel32.CancelIo
CancelIo.argtypes = [wintypes.HANDLE]
CancelIo.restype = wintypes.BOOLEAN
GetOverlappedResult = kernel32.GetOverlappedResult
GetOverlappedResult.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), wintypes.BOOLEAN]
GetOverlappedResult.restype = wintypes.BOOLEAN
WaitForSingleObject = kernel32.WaitForSingleObject
WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
WaitForSingleObject.restype = wintypes.DWORD
CreateEventW = kernel32.CreateEventW
CreateEventW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
CreateEventW.restype = wintypes.HANDLE

class OVERLAPPED(ctypes.Structure):
    _fields_ = [
        ("Internal", ctypes.c_void_p),
        ("InternalHigh", ctypes.c_void_p),
        ("Offset", wintypes.DWORD),
        ("OffsetHigh", wintypes.DWORD),
        ("hEvent", wintypes.HANDLE),
    ]

HidD_SetFeature = hid.HidD_SetFeature
HidD_SetFeature.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_SetFeature.restype = wintypes.BOOLEAN
HidD_SetOutputReport = hid.HidD_SetOutputReport
HidD_SetOutputReport.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_SetOutputReport.restype = wintypes.BOOLEAN
HidD_GetInputReport = hid.HidD_GetInputReport
HidD_GetInputReport.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_GetInputReport.restype = wintypes.BOOLEAN
HidD_GetPreparsedData = hid.HidD_GetPreparsedData
HidD_GetPreparsedData.argtypes = [wintypes.HANDLE, ctypes.POINTER(ctypes.c_void_p)]
HidD_GetPreparsedData.restype = wintypes.BOOLEAN
HidD_FreePreparsedData = hid.HidD_FreePreparsedData
HidD_FreePreparsedData.argtypes = [ctypes.c_void_p]
HidD_FreePreparsedData.restype = wintypes.BOOLEAN

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3
FILE_FLAG_OVERLAPPED = 0x40000000
WAIT_TIMEOUT = 0x102
WAIT_OBJECT_0 = 0
ERROR_IO_PENDING = 997
ERROR_INVALID_FUNCTION = 1
INVALID_HANDLE_VALUE = 0xFFFFFFFFFFFFFFFF

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


def write_with_timeout(handle, data, size, label, timeout_ms=2000):
    """WriteFile con OVERLAPPED + WaitForSingleObject + timeout."""
    ov = OVERLAPPED()
    ov.hEvent = CreateEventW(None, True, False, None)
    if not ov.hEvent:
        return False, "CreateEventW fallo", 0
    try:
        b = ctypes.create_string_buffer(data, size)
        written = wintypes.DWORD(0)
        ok = WriteFile(handle, ctypes.byref(b), size, ctypes.byref(written), ctypes.byref(ov))
        if not ok:
            err = GetLastError()
            if err != ERROR_IO_PENDING:
                return False, f"WriteFile fallo: err={err}", 0
            # Esperar con timeout
            w = WaitForSingleObject(ov.hEvent, timeout_ms)
            if w == WAIT_TIMEOUT:
                CancelIo(handle)
                return False, f"WriteFile timeout ({timeout_ms}ms)", 0
            elif w != WAIT_OBJECT_0:
                return False, f"WaitForSingleObject fallo: {w}", 0
            # GetOverlappedResult para obtener written
            if not GetOverlappedResult(handle, ctypes.byref(ov), ctypes.byref(written), False):
                err = GetLastError()
                return False, f"GetOverlappedResult fallo: err={err}", 0
        return True, "OK", written.value
    finally:
        if ov.hEvent:
            CloseHandle(ov.hEvent)


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
    print(f"  KX-500 minimal test - color {color_name} = (0x{r:02X}, 0x{g:02X}, 0x{b:02X})")
    print("=" * 78)
    print(f"  HID path: ...{HID_PATH[-60:]}")

    # Abrir el device CON FILE_FLAG_OVERLAPPED para I/O async
    print("\n[1] Abriendo HID device (con FILE_FLAG_OVERLAPPED)...")
    h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        err = GetLastError()
        print(f"  [FAIL] No se pudo abrir. err={err}")
        return 1
    print(f"  [OK] handle=0x{h:X}")

    # Test 1: WriteFile directo
    print("\n[2] WriteFile directo (Output Report de 64B)...")
    out_data = build_solid_color(r, g, b, seq=0x99, size=64)
    ok, msg, written = write_with_timeout(h, out_data, 64, "WriteFile", timeout_ms=2000)
    print(f"  WriteFile: {msg} (written={written}/64)")
    if ok:
        print(f"  [OK] Output Report enviado!")

    # Test 2: HidD_SetOutputReport
    print("\n[3] HidD_SetOutputReport (la API de SignalRGB SDK)...")
    or_data = build_solid_color(r, g, b, seq=0xAA, size=64)
    or_buf = ctypes.create_string_buffer(or_data, 64)
    ok = HidD_SetOutputReport(h, ctypes.byref(or_buf), 64)
    err = GetLastError()
    print(f"  HidD_SetOutputReport: {'OK' if ok else 'FAIL'} (err={err})")
    if ok:
        print(f"  [OK] SetOutputReport OK!")

    # Test 3: HidD_SetFeature
    print("\n[4] HidD_SetFeature con Feature Report de 64B...")
    fr_data = build_solid_color(r, g, b, seq=0xBB, size=64)
    fr_buf = ctypes.create_string_buffer(fr_data, 64)
    ok = HidD_SetFeature(h, ctypes.byref(fr_buf), 64)
    err = GetLastError()
    print(f"  HidD_SetFeature: {'OK' if ok else 'FAIL'} (err={err})")

    # Test 4: HidD_SetFeature con Report ID 0x00
    print("\n[5] HidD_SetFeature con Report ID 0x00...")
    fr_data2 = bytearray(64)
    fr_data2[0] = 0x00
    fr_data2[1] = 0xCC
    fr_data2[2] = 0x01
    fr_data2[3] = 0x06
    fr_data2[4] = 0x03
    fr_data2[5] = 0x05
    fr_data2[6] = 0x00
    fr_data2[7] = 0x00
    fr_data2[8] = r
    fr_data2[9] = g
    fr_data2[10] = b
    fr_buf2 = ctypes.create_string_buffer(bytes(fr_data2), 64)
    ok = HidD_SetFeature(h, ctypes.byref(fr_buf2), 64)
    err = GetLastError()
    print(f"  HidD_SetFeature (ID 0): {'OK' if ok else 'FAIL'} (err={err})")

    # Test 5: HidD_GetInputReport (con timeout via overlapped)
    print("\n[6] HidD_GetInputReport (esperando respuesta del firmware)...")
    in_buf = ctypes.create_string_buffer(64)
    ok = HidD_GetInputReport(h, ctypes.byref(in_buf), 64)
    err = GetLastError()
    if ok:
        print(f"  HidD_GetInputReport: OK (64 bytes):")
        hex_str = " ".join(f"{b:02X}" for b in in_buf.raw)
        print(f"    {hex_str}")
    else:
        print(f"  HidD_GetInputReport: FAIL (err={err})")

    CloseHandle(h)
    print("\n[Done] Handle cerrado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
