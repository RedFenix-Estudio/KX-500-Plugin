# -*- coding: utf-8 -*-
r"""
test_read_write_collision.py
============================
PRUEBA DECISIVA de la hipotesis final:

    "Un ReadFile concurrente sobre el handle HID aborta el WriteFile pendiente"

SignalRGB abre el KX-500 como TECLADO: lee input reports (teclas) y escribe
output reports (RGB) sobre el MISMO handle. En Windows HID, las operaciones
sobre un handle son serializadas: una lectura pendiente cancela el write.

El log de SignalRGB lo dice exactamente:
    hid_write/WaitForSingleObject  -> 0x3E5 ERROR_IO_PENDING   (write pendiente)
    hid_write/GetOverlappedResult  -> 0x3E3 ERROR_OPERATION_ABORTED  (cancelado)

Este test mide 3 escenarios y compara la tasa de exito:

    [A] Solo escrituras (sin lecturas concurrentes)
    [B] WriteFile overlapped SIN lecturas concurrentes
    [C] WriteFile overlapped CON lecturas concurrentes   <-- simulacion de SignalRGB

Si [B] es 100% y [C] falla, la hipotesis queda CONFIRMADA y la unica solucion
es: no leer y escribir sobre el mismo handle, o escribir solo cuando el color
cambia (dirty-check, ya implementado en v2.3.0).
"""
import ctypes
import sys
import threading
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
ReadFile = kernel32.ReadFile
ReadFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD,
                     ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
ReadFile.restype = wintypes.BOOLEAN

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


class OVERLAPPED(ctypes.Structure):
    _fields_ = [("Internal", ctypes.c_void_p), ("InternalHigh", ctypes.c_void_p),
                ("Offset", wintypes.DWORD), ("OffsetHigh", wintypes.DWORD),
                ("hEvent", wintypes.HANDLE)]


HidD_SetOutputReport = hid.HidD_SetOutputReport
HidD_SetOutputReport.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_SetOutputReport.restype = wintypes.BOOLEAN

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3
FILE_FLAG_OVERLAPPED = 0x40000000
WAIT_TIMEOUT = 0x102
ERROR_IO_PENDING = 997

HID_PATH = r"\\?\HID#VID_320F&PID_5008&MI_01&Col04#8&1c1f1d2a&0&0003#{4d1e55b2-f16f-11cf-88cb-001111000030}"

_stop = threading.Event()
_reads = [0]


def solid(seq):
    return bytes([0x04, seq & 0xFF, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00,
                  (seq * 7) & 0xFF, (seq * 13) & 0xFF, (seq * 29) & 0xFF] + [0x00] * 53)


def open_hid(overlapped=False):
    flags = FILE_FLAG_OVERLAPPED if overlapped else 0
    h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW,
                    None, OPEN_EXISTING, flags, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        return None, GetLastError()
    return h, 0


def reader_thread(h, label):
    """Simula SignalRGB leyendo input reports continuamente.

    NOTA: ReadFile SIN overlapped BLOQUEA PARA SIEMPRE cuando el device no
    envia input reports (este collection vendor-defined no los produce).
    Por eso el reader usa OVERLAPPED con timeout corto y CancelIo.
    """
    while not _stop.is_set():
        ov = OVERLAPPED()
        ov.hEvent = CreateEventW(None, True, False, None)
        try:
            buf = ctypes.create_string_buffer(64)
            got = wintypes.DWORD(0)
            ok = ReadFile(h, ctypes.byref(buf), 64, ctypes.byref(got), ctypes.byref(ov))
            if ok:
                _reads[0] += 1
                continue
            if GetLastError() == ERROR_IO_PENDING:
                w = WaitForSingleObject(ov.hEvent, 10)   # 10 ms
                if w == WAIT_TIMEOUT:
                    CancelIo(h)          # aborta la lectura pendiente
                    w2 = WaitForSingleObject(ov.hEvent, 50)
                    _reads[0] += 1         # cuenta como "lectura en vuelo"
                    if _reads[0] > 3000:
                        break
                elif w == 0:
                    _reads[0] += 1
            time.sleep(0.005)
        finally:
            CloseHandle(ov.hEvent)
        if _reads[0] > 3000:
            break
    print(f"    (reader {label}: {_reads[0]} lecturas)")


def write_setoutputreport(h, seq):
    b = ctypes.create_string_buffer(solid(seq), 64)
    return bool(HidD_SetOutputReport(h, ctypes.byref(b), 64))


def writefile_overlapped(h, seq, timeout_ms=300):
    """Replica exactamente lo que hace el SDK de SignalRGB."""
    ov = OVERLAPPED()
    ov.hEvent = CreateEventW(None, True, False, None)
    try:
        b = ctypes.create_string_buffer(solid(seq), 64)
        written = wintypes.DWORD(0)
        ok = WriteFile(h, ctypes.byref(b), 64, ctypes.byref(written), ctypes.byref(ov))
        if not ok:
            err = GetLastError()
            if err != ERROR_IO_PENDING:
                return "FAIL_IMMEDIATO"
        w = WaitForSingleObject(ov.hEvent, timeout_ms)
        if w == WAIT_TIMEOUT:
            CancelIo(h)
            return "TIMEOUT"
        if w != 0:
            return "FAIL_WAIT"
        if not GetOverlappedResult(h, ctypes.byref(ov), ctypes.byref(written), False):
            err = GetLastError()
            if err == 995:
                return "ABORTED_995"
            return f"FAIL_RES(err={err})"
        return "OK"
    finally:
        CloseHandle(ov.hEvent)


def bench(label, fn, n=25, delay=0.08):
    counts = {}
    for i in range(n):
        r = fn(i + 1)
        counts[r] = counts.get(r, 0) + 1
        time.sleep(delay)
    ok = counts.get("OK", 0) + counts.get("True", 0) + counts.get("False", 0)
    print(f"  {label}")
    for k, v in sorted(counts.items(), key=lambda x: -x[1]):
        pct = 100.0 * v / n
        print(f"      {k:<18} {v:>3}/{n}  ({pct:5.1f}%)")
    return ok


def main():
    global _stop
    print("=" * 84)
    print("  COLISION LECTURA-ESCRITURA sobre el handle HID del KX-500")
    print("=" * 84)

    # [A] HidD_SetOutputReport, sin lector concurrente
    print("\n[A] HidD_SetOutputReport — sin lecturas concurrentes")
    h, err = open_hid(False)
    if not h:
        print(f"    [FAIL] no se pudo abrir err={err}")
        return 1
    bench("HidD_SetOutputReport (sin lector)", lambda s: "OK" if write_setoutputreport(h, s) else "FAIL")
    CloseHandle(h)
    time.sleep(0.3)

    # [B] WriteFile overlapped, sin lector concurrente
    print("\n[B] WriteFile OVERLAPPED — sin lecturas concurrentes  (sin SignalRGB)")
    h, err = open_hid(True)
    if not h:
        print(f"    [FAIL] no se pudo abrir err={err}")
        return 1
    bench("WriteFile overlapped (sin lector)", lambda s: writefile_overlapped(h, s))
    CloseHandle(h)
    time.sleep(0.3)

    # [C] WriteFile overlapped CON lector concurrente
    print("\n[C] WriteFile OVERLAPPED — CON lecturas concurrentes  (simula SignalRGB)")
    _stop = threading.Event()
    _reads[0] = 0
    h, err = open_hid(True)
    if not h:
        print(f"    [FAIL] no se pudo abrir err={err}")
        return 1
    t = threading.Thread(target=reader_thread, args=(h, "C"), daemon=True)
    t.start()
    time.sleep(0.2)
    bench("WriteFile overlapped (CON lector)", lambda s: writefile_overlapped(h, s))
    _stop.set()
    t.join(timeout=2)
    CloseHandle(h)

    # [D] HidD_SetOutputReport CON lector concurrente
    print("\n[D] HidD_SetOutputReport — CON lecturas concurrentes")
    _stop = threading.Event()
    _reads[0] = 0
    # el handle debe ser OVERLAPPED para que el reader pueda usar overlapped ReadFile
    h, err = open_hid(True)
    if not h:
        print(f"    [FAIL] no se pudo abrir err={err}")
        return 1
    t = threading.Thread(target=reader_thread, args=(h, "D"), daemon=True)
    t.start()
    time.sleep(0.2)
    bench("HidD_SetOutputReport (CON lector)", lambda s: "OK" if write_setoutputreport(h, s) else "FAIL")
    _stop.set()
    t.join(timeout=2)
    CloseHandle(h)

    print()
    print("=" * 84)
    print("  INTERPRETACION")
    print("=" * 84)
    print("  Si [B] ~100% y [C] falla  -> CONFIRMADO: la lectura aborta el write.")
    print("     Un plugin no puede evitar que SignalRGB lea. La mitigacion es")
    print("     escribir lo minimo posible (dirty-check, ya en v2.3.0).")
    print("  Si [C] ~100%               -> la lectura NO es la causa.")
    print("     El problema seria interno del SDK HID de SignalRGB con este device.")
    print("=" * 84)
    return 0


if __name__ == "__main__":
    sys.exit(main())