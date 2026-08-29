# -*- coding: utf-8 -*-
r"""
test_hidsetfeature.py
=====================
Test directo que usa HidD_SetFeature (como HidServ.dll) para controlar el KX-500.

Descubrimiento clave del RE de HidServ.dll:
- HidServ.dll NO usa Output Reports directamente para RGB. Usa:
  1. CreateFileA() con HID path (r"\\?\HID#VID_320F&PID_5008&MI_01&Col04#...")
  2. HidD_GetPreparsedData() + HidP_GetCaps() para validar el device
  3. HidD_SetFeature() para enviar Feature Reports (encontrado en FUN_0040281d)
  4. WriteFile() para enviar Output Reports (encontrado en FUN_00402705)

Este test intenta el camino HidD_SetFeature primero porque el firmware KX-500
responde a Feature Reports segun el decompile.

Uso:
    python test_hidsetfeature.py red
    python test_hidsetfeature.py green
    python test_hidsetfeature.py blue 0x04
"""
import ctypes
import ctypes.wintypes as wt
import sys
import time
import struct
from ctypes import wintypes

# ============================================================================
# Ctypes bindings
# ============================================================================
cfgmgr32 = ctypes.WinDLL("cfgmgr32")
hid = ctypes.WinDLL("hid.dll")
setupapi = ctypes.WinDLL("setupapi.dll")
kernel32 = ctypes.WinDLL("kernel32")

# CM_Get_Device_Interface_List
CM_Get_Device_Interface_List = cfgmgr32.CM_Get_Device_Interface_ListA
CM_Get_Device_Interface_List.argtypes = [ctypes.c_void_p, ctypes.c_char_p, ctypes.c_char_p, ctypes.c_ulong, ctypes.c_ulong]
CM_Get_Device_Interface_List.restype = ctypes.c_ulong

CM_Get_Device_Interface_List_Size = cfgmgr32.CM_Get_Device_Interface_List_SizeA
CM_Get_Device_Interface_List_Size.argtypes = [ctypes.POINTER(ctypes.c_ulong), ctypes.c_void_p, ctypes.c_char_p, ctypes.c_ulong]
CM_Get_Device_Interface_List_Size.restype = ctypes.c_ulong

CR_SUCCESS = 0

# HidD_GetHidGuid
HidD_GetHidGuid = hid.HidD_GetHidGuid
HidD_GetHidGuid.argtypes = [ctypes.POINTER(ctypes.c_byte * 16)]
HidD_GetHidGuid.restype = None

# HidD_SetFeature
HidD_SetFeature = hid.HidD_SetFeature
HidD_SetFeature.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_SetFeature.restype = wintypes.BOOLEAN

# HidD_GetFeature
HidD_GetFeature = hid.HidD_GetFeature
HidD_GetFeature.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_GetFeature.restype = wintypes.BOOLEAN

# HidD_GetInputReport
HidD_GetInputReport = hid.HidD_GetInputReport
HidD_GetInputReport.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_GetInputReport.restype = wintypes.BOOLEAN

# HidD_GetPreparsedData
HidD_GetPreparsedData = hid.HidD_GetPreparsedData
HidD_GetPreparsedData.argtypes = [wintypes.HANDLE, ctypes.POINTER(ctypes.c_void_p)]
HidD_GetPreparsedData.restype = wintypes.BOOLEAN

# HidD_FreePreparsedData
HidD_FreePreparsedData = hid.HidD_FreePreparsedData
HidD_FreePreparsedData.argtypes = [ctypes.c_void_p]
HidD_FreePreparsedData.restype = wintypes.BOOLEAN

# HidD_GetAttributes
class HIDD_ATTRIBUTES(ctypes.Structure):
    _fields_ = [
        ("Size", ctypes.c_ulong),
        ("VendorID", ctypes.c_ushort),
        ("ProductID", ctypes.c_ushort),
        ("VersionNumber", ctypes.c_ushort),
    ]
HidD_GetAttributes = hid.HidD_GetAttributes
HidD_GetAttributes.argtypes = [wintypes.HANDLE, ctypes.POINTER(HIDD_ATTRIBUTES)]
HidD_GetAttributes.restype = wintypes.BOOLEAN

# HidP_GetCaps
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

# SetupDi* (para SetupDiGetClassDevs alternativa)
SetupDiGetClassDevs = setupapi.SetupDiGetClassDevsA
SetupDiGetClassDevs.argtypes = [ctypes.c_void_p, ctypes.c_char_p, wintypes.HWND, wintypes.DWORD]
SetupDiGetClassDevs.restype = wintypes.HANDLE

# CreateFileA
CreateFileA = kernel32.CreateFileA
CreateFileA.argtypes = [ctypes.c_char_p, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
CreateFileA.restype = wintypes.HANDLE

CloseHandle = kernel32.CloseHandle
CloseHandle.argtypes = [wintypes.HANDLE]
CloseHandle.restype = wintypes.BOOLEAN

GetLastError = kernel32.GetLastError
GetLastError.argtypes = []
GetLastError.restype = wintypes.DWORD

WriteFile = kernel32.WriteFile
WriteFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
WriteFile.restype = wintypes.BOOLEAN

ReadFile = kernel32.ReadFile
ReadFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
ReadFile.restype = wintypes.BOOLEAN

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3
DIGCF_PRESENT = 0x2
DIGCF_DEVICEINTERFACE = 0x10

INVALID_HANDLE_VALUE = -1
ERROR_INVALID_FUNCTION = 1
ERROR_NOT_SUPPORTED = 50

TARGET_VID = 0x320F
TARGET_PID = 0x5008


def list_hid_paths():
    """Lista todos los HID paths usando GetRawInputDeviceList + GetRawInputDeviceInfo.
    Funciona en cualquier Windows, devuelve los paths de los HID devices registrados."""
    user32 = ctypes.WinDLL("user32")

    class RAWINPUTDEVICELIST(ctypes.Structure):
        _fields_ = [("hDevice", wintypes.HANDLE), ("dwType", wintypes.DWORD)]

    GetRawInputDeviceList = user32.GetRawInputDeviceList
    GetRawInputDeviceList.argtypes = [ctypes.POINTER(RAWINPUTDEVICELIST), ctypes.POINTER(wintypes.UINT), wintypes.UINT]
    GetRawInputDeviceList.restype = wintypes.UINT

    GetRawInputDeviceInfo = user32.GetRawInputDeviceInfoA
    GetRawInputDeviceInfo.argtypes = [wintypes.HANDLE, wintypes.UINT, ctypes.c_void_p, ctypes.POINTER(wintypes.UINT)]
    GetRawInputDeviceInfo.restype = wintypes.UINT

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
        name_len = wintypes.UINT(0)
        GetRawInputDeviceInfo(dev.hDevice, RIDI_DEVICENAME, None, ctypes.byref(name_len))
        if name_len.value == 0:
            continue
        name_buf = ctypes.create_string_buffer(name_len.value)
        GetRawInputDeviceInfo(dev.hDevice, RIDI_DEVICENAME, name_buf, ctypes.byref(name_len))
        name = name_buf.value.decode("ascii", errors="replace")
        if name and name not in paths:
            paths.append(name)
    return paths


def open_hid(path):
    """Abre un HID device y devuelve (handle, attrs, caps) o None."""
    h = CreateFileA(
        path.encode("ascii"),
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_RW, None, OPEN_EXISTING, 0, None
    )
    if h == INVALID_HANDLE_VALUE or not h:
        return None
    try:
        attrs = HIDD_ATTRIBUTES()
        attrs.Size = ctypes.sizeof(HIDD_ATTRIBUTES)
        if not HidD_GetAttributes(h, ctypes.byref(attrs)):
            CloseHandle(h)
            return None
        if attrs.VendorID != TARGET_VID or attrs.ProductID != TARGET_PID:
            CloseHandle(h)
            return None
        # Get caps
        prep = ctypes.c_void_p(0)
        caps = None
        if HidD_GetPreparsedData(h, ctypes.byref(prep)):
            caps = HIDP_CAPS()
            if HidP_GetCaps(prep, ctypes.byref(caps)) != 0:
                caps = None
            HidD_FreePreparsedData(prep)
        return h, attrs, caps
    except Exception:
        CloseHandle(h)
        return None


def find_kx500():
    """Encuentra el KX-500 y devuelve una lista de (path, handle, attrs, caps)."""
    paths = list_hid_paths()
    results = []
    for p in paths:
        if f"VID_{TARGET_VID:04X}" not in p or f"PID_{TARGET_PID:04X}" not in p:
            continue
        opened = open_hid(p)
        if opened:
            h, attrs, caps = opened
            results.append((p, h, attrs, caps))
    return results


def build_solid_color_feature(r, g, b, seq=0x42, size=101):
    """[REPORT_ID] [SEQ] 01 06 03 05 00 00 R G B + padding"""
    buf = bytearray(size)
    buf[0] = 0x04  # Report ID
    buf[1] = seq
    buf[2] = 0x01
    buf[3] = 0x06
    buf[4] = 0x03
    buf[5] = 0x05
    buf[6] = 0x00
    buf[7] = 0x00
    buf[8] = r & 0xFF
    buf[9] = g & 0xFF
    buf[10] = b & 0xFF
    return bytes(buf)


def build_handshake_packets():
    """16 paquetes del handshake de inicializacion (visto en USBPcap).
    Formato: 04 [SEQ] 03 04 2C 00 00 00 55 AA FF 02 0F 32 08 50 01 [version] 00 18 00 00 00 00 01 02 03 04 ..."""
    packets = []
    # Paquete 0: handshake inicial (sacado de la captura 04 A2 03 04 2C 00 00 00 55 AA FF 02 0F 32 08 50 01 01 00 18 00 00 00 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F 10 11 12 14)
    p0 = bytearray(64)
    data0 = bytes.fromhex(
        "04A203042C000000"   # 04 A2 03 04 2C 00 00 00
        "550A"               # 55 0A (FF esperado, lo cambio a 0A para que sea valido)
        "FF"                 # FF
        "020F32085001"       # 02 0F 32 08 50 01 (VID/PID invertido)
        "0100"               # version 0x0101 -> 01 00
        "1800000000010203040506070809"  # payload
    )
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


def main():
    color_name = sys.argv[1] if len(sys.argv) > 1 else "red"
    color_map = {
        "red":   (0xFF, 0x00, 0x00),
        "green": (0x00, 0xFF, 0x00),
        "blue":  (0x00, 0x00, 0xFF),
        "white": (0xFF, 0xFF, 0xFF),
        "off":   (0x00, 0x00, 0x00),
        "yellow":(0xFF, 0xFF, 0x00),
        "cyan":  (0x00, 0xFF, 0xFF),
        "magenta":(0xFF, 0x00, 0xFF),
    }
    cr_, cg_, cb_ = color_map.get(color_name.lower(), (0xFF, 0x00, 0x00))
    print("=" * 78)
    print(f"  KX-500 RGB test via HidD_SetFeature (como HidServ.dll)")
    print(f"  Color: {color_name} = (0x{cr_:02X}, 0x{cg_:02X}, 0x{cb_:02X})")
    print("=" * 78)

    print("\n[Paso 1] Buscando KX-500 (VID=0x320F, PID=0x5008)...")
    devices = find_kx500()
    if not devices:
        print("  [FAIL] KX-500 no encontrado. Verifica que esta conectado.")
        return 1
    print(f"  [FOUND] {len(devices)} HID interface(s) del KX-500:")
    for i, (path, h, attrs, caps) in enumerate(devices):
        feat_len = caps.FeatureReportByteLength if caps else 0
        out_len = caps.OutputReportByteLength if caps else 0
        in_len = caps.InputReportByteLength if caps else 0
        if caps and (caps.UsagePage or caps.Usage):
            up = f"0x{caps.UsagePage:04X}"
            u = f"0x{caps.Usage:04X}"
        else:
            up = "?"
            u = "?"
        # Marcar el candidato RGB (declarado como Mouse en USB descriptor)
        is_mouse_path = "Col0" in path and path.endswith("4d1e55b2-f16f-11cf-88cb-001111000030}")
        flag = "  <-- posible RGB" if is_mouse_path else ""
        print(f"    [{i}] {path[-90:]}{flag}")
        print(f"        UsagePage={up} Usage={u} Feat={feat_len}B Out={out_len}B In={in_len}B")
        if caps and feat_len == 0 and out_len == 0 and in_len == 0:
            print(f"        [NOTA] capabilities=0/0/0. Probablemente el driver de kernel (FwCustom) intercepta este HID.")

    # Probar cada interface
    for idx, (path, handle, attrs, caps) in enumerate(devices):
        print(f"\n[Paso 2.{idx}] Probando interface {idx}:")
        print(f"  Path: {path[-80:]}")
        if caps:
            print(f"  Feature={caps.FeatureReportByteLength} Out={caps.OutputReportByteLength} In={caps.InputReportByteLength}")

        # Tamano de feature
        feat_size = 101
        if caps and caps.FeatureReportByteLength > 0:
            feat_size = caps.FeatureReportByteLength

        # Handshake primero
        print(f"  Enviando handshake de 16 paquetes via HidD_SetFeature...")
        packets = build_handshake_packets()
        handshake_ok = 0
        for j, p in enumerate(packets):
            b = ctypes.create_string_buffer(p, len(p))
            if HidD_SetFeature(handle, ctypes.byref(b), len(p)):
                handshake_ok += 1
            time.sleep(0.01)
        print(f"  Handshake: {handshake_ok}/16 paquetes aceptados")

        # Solid color via Feature
        print(f"  Enviando solid color ({color_name}) via HidD_SetFeature (size={feat_size}B)...")
        feature_buf = build_solid_color_feature(cr_, cg_, cb_, seq=0x42, size=feat_size)
        b = ctypes.create_string_buffer(feature_buf, feat_size)
        ok = HidD_SetFeature(handle, ctypes.byref(b), feat_size)
        err = GetLastError()
        print(f"  HidD_SetFeature: {'OK' if ok else 'FAIL'} (err={err})")
        if ok:
            print(f"  [OK] Feature Report enviado al interface {idx}!")
        else:
            if err == ERROR_INVALID_FUNCTION:
                print(f"  [INFO] firmware no soporta Feature Reports en este interface")
            elif err == ERROR_NOT_SUPPORTED:
                print(f"  [INFO] feature no soportada en este interface")

        # Tambien probar WriteFile (Output)
        if caps and caps.OutputReportByteLength > 0:
            out_size = caps.OutputReportByteLength
            print(f"  Probando WriteFile con Output Report (size={out_size}B)...")
            out_data = build_solid_color_feature(cr_, cg_, cb_, seq=0x42, size=out_size)
            ob = ctypes.create_string_buffer(out_data, out_size)
            written = wintypes.DWORD(0)
            ok2 = WriteFile(handle, ctypes.byref(ob), out_size, ctypes.byref(written), None)
            err2 = GetLastError()
            print(f"  WriteFile: {'OK' if ok2 else 'FAIL'} (err={err2}, written={written.value})")

    # Cleanup
    print(f"\n[Cleanup] Cerrando handles HID estandar...")
    for _, h, _, _ in devices:
        CloseHandle(h)

    # Paso final: probar device path custom \\.\FwCustom (que usa el .exe oficial)
    print()
    print("=" * 78)
    print("  [Paso 3] Probando device path custom: \\\\.\\FwCustom")
    print("          (es el path que usa el .exe oficial HidServ.dll)")
    print("=" * 78)
    fwcustom_handle = CreateFileA(
        b"\\\\.\\FwCustom",
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_RW, None, OPEN_EXISTING, 0, None
    )
    if fwcustom_handle and fwcustom_handle != INVALID_HANDLE_VALUE:
        print(f"  [OK] Handle abierto a \\\\.\\FwCustom")
        # Handshake completo
        print(f"  Enviando handshake de 16 paquetes via WriteFile a FwCustom...")
        packets = build_handshake_packets()
        for j, p in enumerate(packets):
            pb = ctypes.create_string_buffer(p, len(p))
            written = wintypes.DWORD(0)
            ok = WriteFile(fwcustom_handle, ctypes.byref(pb), len(p), ctypes.byref(written), None)
            err = GetLastError()
            status = "OK" if ok and written.value == len(p) else f"FAIL (err={err}, written={written.value}/{len(p)})"
            print(f"    Paquete {j:2d} ({len(p):3d}B): {status}")
            time.sleep(0.01)
        # Solid color
        print(f"  Enviando solid color ({color_name}) via WriteFile a FwCustom...")
        out_data = build_solid_color_feature(cr_, cg_, cb_, seq=0x99, size=64)
        ob = ctypes.create_string_buffer(out_data, 64)
        written = wintypes.DWORD(0)
        ok = WriteFile(fwcustom_handle, ctypes.byref(ob), 64, ctypes.byref(written), None)
        err = GetLastError()
        print(f"  WriteFile: {'OK' if ok else 'FAIL'} (err={err}, written={written.value})")
        if ok:
            print(f"  [OK] Datos enviados a FwCustom. Verifica si el teclado cambio a {color_name}.")
        CloseHandle(fwcustom_handle)
    else:
        err = GetLastError()
        print(f"  [FAIL] No se pudo abrir \\\\.\\FwCustom (err={err})")
        print(f"  Esto puede significar que el driver de kernel FwCustom no esta instalado,")
        print(f"  o que el path es diferente. Verifica con 'WinObj' o 'DeviceTree'.")

    print()
    print("=" * 78)
    print(f"  Resultados:")
    print(f"   - Si HidD_SetFeature fallo con 0 capabilities: el driver de kernel")
    print(f"     intercepta el HID estandar. La unica forma de controlar el KX-500")
    print(f"     es via \\\\.\\FwCustom (path custom del driver oficial).")
    print(f"   - Si WriteFile a \\\\.\\FwCustom dio OK: el plugin debe usar este path")
    print(f"     en lugar del HID estandar.")
    print("=" * 78)
    return 0


if __name__ == "__main__":
    sys.exit(main())
