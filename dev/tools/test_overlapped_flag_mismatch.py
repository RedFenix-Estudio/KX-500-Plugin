# -*- coding: utf-8 -*-
r"""
test_overlapped_flag_mismatch.py
=================================
Bug clasico de SDK HID: abrir el handle SIN FILE_FLAG_OVERLAPPED pero llamar
a WriteFile pasando un OVERLAPPED.

Eso es comportamiento indefinido en Win32: el handle no fue creado para I/O
asincrono, asi que la operacion se encola igual pero no se puede sincronizar.
El sintoma tipico es exactamente el que muestra SignalRGB:

    hid_write/WaitForSingleObject  -> ERROR_IO_PENDING  (0x3E5)
    hid_write/GetOverlappedResult  -> ERROR_OPERATION_ABORTED (0x3E3 / 995)

Escenarios:
    [A] CreateFile(SIN flag) + WriteFile(SIN overlapped)   -> reference OK
    [B] CreateFile(CON flag) + WriteFile(CON overlapped)   -> reference OK
    [C] CreateFile(SIN flag) + WriteFile(CON overlapped)   -> MISMATCH -> bug
    [D] CreateFile(CON flag) + WriteFile(SIN overlapped)   -> MISMATCH -> bug
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
WriteFile = kernel32.WriteFile
WriteFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
                      ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
WriteFile.restype = wintypes.BOOLEAN
CancelIo = kernel32.CancelIo
CancelIo.argtypes = [wintypes.HANDLE]
CancelIo.restype = wintypes.BOOLEAN
WaitForSingleObject = kernel32.WaitForSingleObject
WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
WaitForSingleObject.restype = wintypes.DWORD
CreateEventW = kernel32.CreateEventW
CreateEventW.argtypes = [ctypes.c_void_p, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
CreateEventW.restype = wintypes.HANDLE
GetOverlappedResult = kernel32.GetOverlappedResult
GetOverlappedResult.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.POINTER(wintypes.DWORD), wintypes.BOOLEAN]
GetOverlappedResult.restype = wintypes.BOOLEAN
HidD_SetOutputReport = hid.HidD_SetOutputReport
HidD_SetOutputReport.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_SetOutputReport.restype = wintypes.BOOLEAN


class OVERLAPPED(ctypes.Structure):
    _fields_ = [("Internal", ctypes.c_void_p), ("InternalHigh", ctypes.c_void_p),
                ("Offset", wintypes.DWORD), ("OffsetHigh", wintypes.DWORD),
                ("hEvent", wintypes.HANDLE)]


GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3
FILE_FLAG_OVERLAPPED = 0x40000000
WAIT_TIMEOUT = 0x102
WAIT_OBJECT_0 = 0
ERROR_IO_PENDING = 997
HID_PATH = r"\\?\HID#VID_320F&PID_5008&MI_01&Col04#8&1c1f1d2a&0&0003#{4d1e55b2-f16f-11cf-88cb-001111000030}"


def solid(seq):
    return bytes([0x04, seq & 0xFF, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00,
                  (seq * 11) & 0xFF, (seq * 23) & 0xFF, (seq * 31) & 0xFF] + [0x00] * 53)


def open_hid(with_overlapped_flag):
    flags = FILE_FLAG_OVERLAPPED if with_overlapped_flag else 0
    h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW,
                    None, OPEN_EXISTING, flags, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        return None, GetLastError()
    return h, 0


def do_write(h, use_overlapped, timeout_ms=400):
    if not use_overlapped:
        b = ctypes.create_string_buffer(solid(1), 64)
        n = wintypes.DWORD(0)
        ok = WriteFile(h, ctypes.byref(b), 64, ctypes.byref(n), None)
        return f"OK({n.value})" if ok else f"FAIL(err={GetLastError()})"

    ov = OVERLAPPED()
    ov.hEvent = CreateEventW(None, True, False, None)
    try:
        b = ctypes.create_string_buffer(solid(1), 64)
        n = wintypes.DWORD(0)
        ok = WriteFile(h, ctypes.byref(b), 64, ctypes.byref(n), ctypes.byref(ov))
        if ok:
            return f"OK({n.value})"
        if GetLastError() != ERROR_IO_PENDING:
            return f"FAIL(err={GetLastError()})"
        w = WaitForSingleObject(ov.hEvent, timeout_ms)
        if w == WAIT_TIMEOUT:
            CancelIo(h)
            return "TIMEOUT"
        if w != 0:
            return f"FAIL_WAIT({w})"
        if not GetOverlappedResult(h, ctypes.byref(ov), ctypes.byref(n), False):
            err = GetLastError()
            return "ABORTED_995" if err == 995 else f"FAIL_RES(err={err})"
        return f"OK({n.value})"
    finally:
        CloseHandle(ov.hEvent)


def run(label, flag_overlapped, write_overlapped, n=12):
    counts = {}
    for i in range(n):
        r = do_write_flagged(flag_overlapped, write_overlapped)
        counts[r] = counts.get(r, 0) + 1
        time.sleep(0.12)
    print(f"  {label}")
    for k, v in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"      {k:<16} {v:>3}/{n}  ({100.0*v/n:5.1f}%)")
    return counts


def do_write_flagged(flag_overlapped, write_overlapped):
    h, err = open_hid(flag_overlapped)
    if not h:
        return f"OPEN_FAIL({err})"
    try:
        return do_write(h, write_overlapped)
    finally:
        CloseHandle(h)


def main():
    print("=" * 82)
    print("  CreateFile flag vs WriteFile overlapped — combinacion de flags")
    print("=" * 82)
    run("[A] SIN flag  + SIN overlapped   (referencia sincrona)", False, False)
    run("[B] CON flag  + CON overlapped   (referencia asincrona)", True, True)
    run("[C] SIN flag  + CON overlapped   (MISMATCH)", False, True)
    run("[D] CON flag  + SIN overlapped   (MISMATCH)", True, False)

    print()
    print("=" * 82)
    print("  Si [A] y [B] dan 100% OK pero [C] o [D] dan ABORTED_995/TIMEOUT,")
    print("  el bug esta en como SignalRGB abre y escribe el handle HID.")
    print("  Eso seria un bug del SDK de SignalRGB, no del plugin ni del firmware.")
    print("=" * 82)
    return 0


if __name__ == "__main__":
    sys.exit(main())