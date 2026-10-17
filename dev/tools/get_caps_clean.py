# -*- coding: utf-8 -*-
"""
get_caps_clean.py
=================
Consulta HIDP_CAPS de forma confiable para TODOS los collections del KX-500.

Respuesta a la pregunta critica:
  ¿El Output Report del canal RGB (MI_01 & Col04) es realmente de 64 bytes?

Si NO lo es (ej. 11 o 32 bytes), eso explica por que:
  - HidD_SetOutputReport en ctypes "funciona" (no valida strictamente el tamaño)
  - device.write(packet, 64) en SignalRGB SDK falla con ERROR_OPERATION_ABORTED
    (el SDK valida ReportBufferLength contra OutputReportByteLength)
"""
import ctypes
import sys
from ctypes import wintypes

hid = ctypes.WinDLL("hid.dll")
kernel32 = ctypes.WinDLL("kernel32")
setupapi = ctypes.WinDLL("setupapi.dll")

CreateFileW = kernel32.CreateFileW
CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
CreateFileW.restype = wintypes.HANDLE
CloseHandle = kernel32.CloseHandle
GetLastError = kernel32.GetLastError

HidD_GetPreparsedData = hid.HidD_GetPreparsedData
HidD_GetPreparsedData.argtypes = [wintypes.HANDLE, ctypes.POINTER(ctypes.c_void_p)]
HidD_GetPreparsedData.restype = wintypes.BOOLEAN
HidD_FreePreparsedData = hid.HidD_FreePreparsedData
HidD_FreePreparsedData.argtypes = [ctypes.c_void_p]
HidD_FreePreparsedData.restype = wintypes.BOOLEAN

HidD_GetAttributes = hid.HidD_GetAttributes
HidD_GetAttributes.argtypes = [wintypes.HANDLE, ctypes.c_void_p]
HidD_GetAttributes.restype = wintypes.BOOLEAN


class HIDD_ATTRIBUTES(ctypes.Structure):
    _fields_ = [("Size", ctypes.c_ulong),
                ("VendorID", ctypes.c_ushort),
                ("ProductID", ctypes.c_ushort),
                ("VersionNumber", ctypes.c_ushort)]


class HIDP_CAPS(ctypes.Structure):
    _fields_ = [
        ("Usage", ctypes.c_ushort),
        ("UsagePage", ctypes.c_ushort),
        ("InputReportByteLength", ctypes.c_ushort),
        ("OutputReportByteLength", ctypes.c_ushort),
        ("FeatureReportByteLength", ctypes.c_ushort),
        ("Reserved", ctypes.c_ushort * 17),
        ("NumberLinkCollectionNodes", ctypes.c_ushort),
        ("NumberInputButtonCaps", ctypes.c_ushort),
        ("NumberInputValueCaps", ctypes.c_ushort),
        ("NumberInputDataIndices", ctypes.c_ushort),
        ("NumberOutputButtonCaps", ctypes.c_ushort),
        ("NumberOutputValueCaps", ctypes.c_ushort),
        ("NumberOutputDataIndices", ctypes.c_ushort),
        ("NumberFeatureButtonCaps", ctypes.c_ushort),
        ("NumberFeatureValueCaps", ctypes.c_ushort),
        ("NumberFeatureDataIndices", ctypes.c_ushort),
    ]


HidP_GetCaps = hid.HidP_GetCaps
HidP_GetCaps.argtypes = [ctypes.c_void_p, ctypes.POINTER(HIDP_CAPS)]
HidP_GetCaps.restype = ctypes.c_long

HidD_GetHidGuid = hid.HidD_GetHidGuid
HidD_GetHidGuid.argtypes = [ctypes.c_void_p]
HidD_GetHidGuid.restype = None

SetupDiGetClassDevsA = setupapi.SetupDiGetClassDevsA
SetupDiGetClassDevsA.argtypes = [ctypes.c_void_p, ctypes.c_char_p, wintypes.HWND, wintypes.DWORD]
SetupDiGetClassDevsA.restype = wintypes.HANDLE


class SP_DEVICE_INTERFACE_DATA(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_ulong), ("ClassGuid", ctypes.c_byte * 16),
                ("Flags", ctypes.c_ulong), ("Reserved", ctypes.c_void_p)]


class SP_DEVICE_INTERFACE_DETAIL_DATA(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_ulong), ("DevicePath", ctypes.c_char * 300)]


SetupDiEnumDeviceInterfaces = setupapi.SetupDiEnumDeviceInterfaces
SetupDiEnumDeviceInterfaces.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(SP_DEVICE_INTERFACE_DATA)]
SetupDiEnumDeviceInterfaces.restype = wintypes.BOOLEAN
SetupDiGetDeviceInterfaceDetailA = setupapi.SetupDiGetDeviceInterfaceDetailA
SetupDiGetDeviceInterfaceDetailA.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.POINTER(SP_DEVICE_INTERFACE_DATA), ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.c_void_p]
SetupDiGetDeviceInterfaceDetailA.restype = wintypes.BOOLEAN

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3
DIGCF_PRESENT = 0x2
DIGCF_DEVICEINTERFACE = 0x10


def enumerate_kx500_paths():
    """Usa GetRawInputDeviceList + GetRawInputDeviceInfo (metodo que ya funciono
    en raw_input_list.py). Devuelve los device paths HID del sistema."""
    user32 = ctypes.WinDLL("user32")

    class RAWINPUTDEVICELIST(ctypes.Structure):
        _fields_ = [("hDevice", wintypes.HANDLE), ("dwType", wintypes.DWORD)]

    GetRawInputDeviceList = user32.GetRawInputDeviceList
    GetRawInputDeviceList.argtypes = [ctypes.POINTER(RAWINPUTDEVICELIST), ctypes.POINTER(wintypes.UINT), wintypes.UINT]
    GetRawInputDeviceList.restype = wintypes.UINT

    GetRawInputDeviceInfoA = user32.GetRawInputDeviceInfoA
    GetRawInputDeviceInfoA.argtypes = [wintypes.HANDLE, wintypes.UINT, ctypes.c_void_p, ctypes.POINTER(wintypes.UINT)]
    GetRawInputDeviceInfoA.restype = wintypes.UINT

    RIDI_DEVICENAME = 0x20000007

    n = wintypes.UINT(0)
    GetRawInputDeviceList(None, ctypes.byref(n), ctypes.sizeof(RAWINPUTDEVICELIST))
    if n.value == 0:
        return []
    arr = (RAWINPUTDEVICELIST * n.value)()
    ret = GetRawInputDeviceList(arr, ctypes.byref(n), ctypes.sizeof(RAWINPUTDEVICELIST))
    paths = []
    for i in range(ret):
        dev = arr[i]
        nlen = wintypes.UINT(0)
        GetRawInputDeviceInfoA(dev.hDevice, RIDI_DEVICENAME, None, ctypes.byref(nlen))
        if nlen.value == 0:
            continue
        nbuf = ctypes.create_string_buffer(nlen.value)
        GetRawInputDeviceInfoA(dev.hDevice, RIDI_DEVICENAME, nbuf, ctypes.byref(nlen))
        p = nbuf.value.decode("ascii", errors="replace")
        if p and p not in paths:
            paths.append(p)
    return paths


def main():
    print("=" * 84)
    print("  HIDP_CAPS reales por collection del KX-500 (VID 320F / PID 5008)")
    print("=" * 84)
    print(f"  {'Collection':<14} {'Usage':<12} {'UsagePage':<12} {'In':>5} {'Out':>5} {'Feat':>5}")
    print("  " + "-" * 80)

    results = {}
    for path in enumerate_kx500_paths():
        pl = path.lower()
        if "vid_320f" not in pl or "pid_5008" not in pl:
            continue
        # Extraer identificador de collection
        coll = "?"
        for key in ("col01", "col02", "col03", "col04", "mi_00", "mi_01"):
            if key in pl:
                coll = key.upper()
                break

        # GetRawInputDeviceInfo devuelve el path con prefijo \\?\ -> CreateFileW lo acepta
        h = CreateFileW(path, GENERIC_READ, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
        if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
            print(f"  {coll:<14} <no se pudo abrir: err={GetLastError()}>")
            continue
        try:
            attrs = HIDD_ATTRIBUTES()
            attrs.Size = ctypes.sizeof(HIDD_ATTRIBUTES)
            HidD_GetAttributes(h, ctypes.byref(attrs))

            prep = ctypes.c_void_p(0)
            if not HidD_GetPreparsedData(h, ctypes.byref(prep)):
                print(f"  {coll:<14} <HidD_GetPreparsedData fallo: err={GetLastError()}>")
                continue
            caps = HIDP_CAPS()
            status = HidP_GetCaps(prep, ctypes.byref(caps))
            HidD_FreePreparsedData(prep)

            if status != 0:
                print(f"  {coll:<14} <HidP_GetCaps fallo: status=0x{status & 0xFFFFFFFF:08X}>")
                continue

            up = caps.UsagePage
            u = caps.Usage
            results[coll] = (u, up, caps.InputReportByteLength,
                             caps.OutputReportByteLength, caps.FeatureReportByteLength, path)
            print(f"  {coll:<14} 0x{u:04X}     0x{up:04X}     {caps.InputReportByteLength:>5} {caps.OutputReportByteLength:>5} {caps.FeatureReportByteLength:>5}")
        finally:
            CloseHandle(h)

    print()
    print("=" * 84)
    rgb = results.get("COL04")
    if rgb:
        u, up, inb, outb, featb, path = rgb
        print(f"  CANAL RGB = COL04  (Usage 0x{u:04X} / UsagePage 0x{up:04X})")
        print(f"    InputReportByteLength   = {inb}")
        print(f"    OutputReportByteLength  = {outb}   <-- el plugin escribe 64 bytes")
        print(f"    FeatureReportByteLength = {featb}")
        print()
        if outb == 64:
            print("  => 64 bytes CONFIRMADO. El tamaño del buffer NO es el problema.")
        elif outb == 0:
            print("  => OutputReportByteLength = 0: este collection NO declara Output Reports.")
            print("     Los RGB viajan por otro mecanismo (Feature/Set_Report sobre Set_Idle, o bulk OUT).")
        else:
            print(f"  => DESCOBRIMIENTO: el Output Report real es de {outb} bytes, NO 64.")
            print(f"     El plugin envia 64 bytes -> SignalRGB SDK lo rechaza (ERROR_OPERATION_ABORTED).")
            print(f"     HidD_SetOutputReport en ctypes 'funciona' porque no valida el tamaño.")
            print(f"     FIX: cambiar REPORT_SIZE del plugin de 64 a {outb}.")
    else:
        print("  No se encontro COL04")
    return 0


if __name__ == "__main__":
    sys.exit(main())