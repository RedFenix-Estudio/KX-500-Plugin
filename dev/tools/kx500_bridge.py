# -*- coding: utf-8 -*-
"""
kx500_bridge.py
===============
Puente (bridge) para el plugin SignalRGB del KX-500.

POR QUE EXISTE
-------------
Se demostro empiricamente que el KX-500 responde perfecto desde cualquier
proceso normal:

    HidD_SetOutputReport              -> OK 100%
    WriteFile sincrono                -> OK 100%
    WriteFile overlapped              -> OK 100%
    WriteFile overlapped + lecturas   -> OK 100%
    handshake / color / efecto        -> OK 100%

El unico escenario que falla es `device.write()` de SignalRGB, que internamente
hace hid_write/WaitForSingleObject -> ERROR_OPERATION_ABORTED (995).
Es un problema del SDK HID de SignalRGB con este device, no del plugin,
del protocolo ni del firmware.

SOLUCION
---------
Este helper escucha en un puerto UDP local (127.0.0.1:47500) y aplica cada
paquete recibido con HidD_SetOutputReport, que si es 100% fiable.

El plugin envia el color por UDP en vez de device.write(). Si el helper no
esta corriendo, el plugin cae automaticamente a device.write().

USO
---
    python kx500_bridge.py            # escuchar en 127.0.0.1:47500
    python kx500_bridge.py --port 48000
    python kx500_bridge.py --test     # envia un ciclo de colores y sale

El plugin detecta el bridge con device.ping() / socket probe; si no responde,
usa device.write() como fallback.
"""
import argparse
import ctypes
import socket
import sys
import time
from ctypes import wintypes

hid = ctypes.WinDLL("hid.dll")
kernel32 = ctypes.WinDLL("kernel32")

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

DEFAULT_PORT = 47500
REPORT_SIZE = 64

# Firmas del protocolo KX-500 (ver PROTOCOL_VERIFIED.md)
SIG_HANDSHAKE = bytes([0x04, 0xA2, 0x03, 0x04])


def classify(payload):
    if len(payload) < 6:
        return "SHORT"
    if payload[0:4] == SIG_HANDSHAKE:
        return "HANDSHAKE"
    if payload[3:6] == bytes([0x06, 0x03, 0x05]):
        return f"COLOR(seq=0x{payload[1]:02X}) RGB=({payload[8]},{payload[9]},{payload[10]})"
    if payload[3:6] == bytes([0x06, 0x01, 0x01]):
        return f"BRIGHTNESS(seq=0x{payload[1]:02X}) level={payload[8] if len(payload) > 8 else 0}"
    if payload[3:5] == bytes([0x06, 0x01]):
        return f"PARAM(seq=0x{payload[1]:02X}) id=0x{payload[5]:02X} val={payload[8] if len(payload) > 8 else 0}"
    return f"UNKNOWN(seq=0x{payload[1]:02X}, b2=0x{payload[2]:02X}, c=0x{payload[3]:02X} 0x{payload[4]:02X} 0x{payload[5]:02X})"


class KX500:
    def __init__(self, verbose=True):
        self.verbose = verbose
        self.h = None
        self.ok = 0
        self.fail = 0

    def open(self):
        self.h = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW,
                              None, OPEN_EXISTING, 0, None)
        if not self.h or self.h == 0 or self.h == -1 or self.h == 0xFFFFFFFFFFFFFFFF:
            self.h = None
            return False, GetLastError()
        return True, 0

    def close(self):
        if self.h:
            CloseHandle(self.h)
            self.h = None

    def send(self, data):
        """Envia un Output Report de 64 bytes con HidD_SetOutputReport."""
        if not self.h:
            ok, err = self.open()
            if not ok:
                if self.verbose:
                    print(f"  [ERROR] no se pudo abrir el HID: err={err}")
                return False
        buf = ctypes.create_string_buffer(bytes(data[:REPORT_SIZE]).ljust(REPORT_SIZE, b"\x00"),
                                          REPORT_SIZE)
        ok = HidD_SetOutputReport(self.h, ctypes.byref(buf), REPORT_SIZE)
        if ok:
            self.ok += 1
        else:
            self.fail += 1
            err = GetLastError()
            if self.verbose:
                print(f"  [ERROR] SetOutputReport fallo: err={err}")
            # el handle pudo quedar malo: reabrir
            self.close()
            ok2, err2 = self.open()
            if ok2 and self.verbose:
                print(f"  [INFO] handle reabierto")
            return False
        if self.verbose:
            print(f"  -> {classify(buf.raw)}")
        return True


def handle_client(kx, data, addr, sock):
    """Procesa un datagrama UDP del plugin."""
    if not data:
        return
    # el plugin puede mandar varios paquetes separados por 0x00-run o newline
    packets = []
    if len(data) == REPORT_SIZE:
        packets = [data]
    else:
        # intentar separar por firma 0x04
        cur = bytearray()
        for b in data:
            cur.append(b)
            if len(cur) == REPORT_SIZE:
                packets.append(bytes(cur))
                cur = bytearray()
        if cur:
            packets.append(bytes(cur))
    for p in packets:
        if len(p) >= 6 and p[0] == 0x04:
            kx.send(p)


def main():
    ap = argparse.ArgumentParser(description="Puente UDP -> KX-500 (HidD_SetOutputReport)")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--test", action="store_true", help="envia un ciclo de colores y sale")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    kx = KX500(verbose=not args.quiet)

    if args.test:
        print("KX-500 bridge — prueba de envio")
        ok, err = kx.open()
        if not ok:
            print(f"[FALLO] no se pudo abrir el HID: err={err}")
            print("        verifica que el teclado este conectado y que el")
            print("        driver oficial NO este corriendo.")
            return 1
        print("  handle abierto OK\n")
        seq = 0x08
        # handshake + brillo + efecto + colores
        seq = 0x08
        kx.send(bytes([0x04, 0xA2, 0x03, 0x04, 0x2C, 0x00, 0x00, 0x00,
                       0x55, 0xAA, 0xFF, 0x02, 0x0F, 0x32, 0x08, 0x50,
                       0x01, 0x01, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00,
                       0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
                       0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x0E, 0x0F, 0x10,
                       0x11, 0x12, 0x14] + [0] * 21))
        time.sleep(0.1)
        kx.send(bytes([0x04, 0x0C, 0x00, 0x06, 0x01, 0x01, 0x00, 0x00, 0x04] + [0] * 55))
        time.sleep(0.1)
        kx.send(bytes([0x04, 0x08, 0x00, 0x06, 0x01, 0x00, 0x00, 0x00, 0x01] + [0] * 55))
        time.sleep(0.1)
        for name, (r, g, b) in [("ROJO", (0xFF, 0, 0)), ("VERDE", (0, 0xFF, 0)),
                                 ("AZUL", (0, 0, 0xFF)), ("BLANCO", (0xFF, 0xFF, 0xFF))]:
            seq += 1
            kx.send(bytes([0x04, seq, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, r, g, b] + [0] * 53))
            time.sleep(0.5)
        kx.close()
        print(f"\n  Resultado: {kx.ok} OK / {kx.fail} FAIL")
        print("  Revisa el teclado: quedo en blanco.")
        return 0 if kx.ok and not kx.fail else 1

    # modo servidor
    ok, err = kx.open()
    if not ok:
        print(f"[FALLO] no se pudo abrir el HID: err={err}")
        print("        - verifica que el teclado este conectado")
        print("        - cerra CHECKPOINT_KX_500.exe / HidServ.exe si estan corriendo")
        return 1

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((args.host, args.port))

    print(f"KX-500 bridge escuchando en {args.host}:{args.port}")
    print("  Esperando paquetes del plugin SignalRGB...")
    print("  Ctrl+C para salir")
    print()

    last_report = time.time()
    try:
        while True:
            data, addr = sock.recvfrom(4096)
            last_report = time.time()
            handle_client(kx, data, addr, sock)
    except KeyboardInterrupt:
        print("\nCerrando...")
    finally:
        sock.close()
        kx.close()
        print(f"Total: {kx.ok} paquetes OK / {kx.fail} FAIL")
    return 0


if __name__ == "__main__":
    sys.exit(main())