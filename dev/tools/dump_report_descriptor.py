# -*- coding: utf-8 -*-
"""
dump_report_descriptor.py
=========================
Dump el HID Report Descriptor REAL del collection Col04 (el canal RGB).

Por que importa: los tests previosyek de ctypesicae tarn Feature=0B Out=0B In=0B
(11 bytes), no 64. Si el Output Report real del dispositivo no es 64 bytes,
el plugin que escribe 64 via SignalRGB SDK falla, mientras que
HidD_SetOutputReport en ctypes "funciona" porque no valida strictly.

Este script:
1. Abre el HID path de Col04
2. HidD_GetPreparsedData
3. Extrae el Report Descriptor del preparsed data
4. Lo parsea item por item (items de HID Report Descriptor)
"""
import ctypes
import sys
from ctypes import wintypes

hid = ctypes.WinDLL("hid.dll")
kernel32 = ctypes.WinDLL("kernel32")

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


GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3

HID_PATH = r"\\?\HID#VID_320F&PID_5008&MI_01&Col04#8&1c1f1d2a&0&0003#{4d1e55b2-f16f-11cf-88cb-001111000030}"

# Report Descriptor item types
ITEM_TYPES = {
    0x04: "Main",
    0x08: "Global",
    0xFE: "Local",
}
MAIN_TAGS = {
    0x8B: "Input",
    0x9B: "Output",
    0xAB: "Feature",
    0xBB: "Collection",
    0xCB: "EndCollection",
}
GLOBAL_TAGS = {
    0x0: "UsagePage",
    0x1: "LogicalMinimum",
    0x2: "LogicalMaximum",
    0x3: "PhysicalMinimum",
    0x4: "PhysicalMaximum",
    0x5: "UnitExponent",
    0x6: "Unit",
    0x7: "ReportSize",
    0x8: "ReportID",
    0x9: "ReportCount",
    0xA: "Push",
    0xB: "Pop",
}
LOCAL_TAGS = {
    0x0: "Usage",
    0x1: "UsageMinimum",
    0x2: "UsageMaximum",
    0x4: "DesignatorIndex",
    0x7: "StringIndex",
}


def parse_descriptor(desc, indent=0):
    """Parsea un HID Report Descriptor y devuelve (lineas, output_report_size, input_report_size, feature_report_size)."""
    lines = []
    i = 0
    n = len(desc)

    report_size = 0
    report_count = 0
    report_id = 0
    # sizes[report_id] = [input, output, feature]
    sizes = {}

    while i < n:
        b = desc[i]
        if b == 0xFE:
            i += 1
            if i >= n:
                break
            bsize = desc[i]
            if bsize == 0:
                break
            data = desc[i + 1: i + 1 + bsize]
            tag = (data[0] >> 4) & 0x0F
            _type = data[0] & 0x0C
            val = 0
            for k, byte in enumerate(data[1:4]):
                val |= byte << (8 * k)
            name = LOCAL_TAGS.get(tag, f"Local_{tag}")
            lines.append("  " * indent + f"    Local  {name} = 0x{val:X}")
            i += 1 + bsize
            continue

        btype = (b >> 2) & 0x03
        btag = (b >> 4) & 0x0F
        bsize = b & 0x03
        if bsize == 3:
            bsize = 4

        data_bytes = desc[i + 1: i + 1 + bsize]
        val = 0
        for k, byte in enumerate(data_bytes):
            val |= byte << (8 * k)

        if btype == 0:  # Main
            name = MAIN_TAGS.get(btag, f"Main_{btag}")
            lines.append("  " * indent + f"  Main  {name}")
            if btag in (0x8B, 0x9B, 0xAB):  # Input/Output/Feature
                bits = report_size * report_count
                slot = sizes.setdefault(report_id, [0, 0, 0])
                idx = {0x8B: 0, 0x9B: 1, 0xAB: 2}[btag]
                # Las flags en bsize>0 Consumir variable data
                if bsize > 0:
                    flags = data_bytes[0]
                    variable = (flags & 0x02) != 0
                    if variable:
                        # Cada campo consume report_size bits -> sumar report_count*report_size
                        slot[idx] += bits
                    else:
                        # constante: report_count campos de report_size bits
                        slot[idx] += bits
                else:
                    slot[idx] += bits
                lines.append("  " * indent + f"        -> {bits} bits (ReportSize={report_size} x ReportCount={report_count})")
        elif btype == 1:  # Global
            name = GLOBAL_TAGS.get(btag, f"Global_{btag}")
            if btag == 0x7:
                report_size = val
            elif btag == 0x9:
                report_count = val
            elif btag == 0x8:
                report_id = val
                sizes.setdefault(val, [0, 0, 0])
            lines.append("  " * indent + f"  Global {name} = {val} (0x{val:X})")
        else:  # Local
            name = LOCAL_TAGS.get(btag, f"Local_{btag}")
            lines.append("  " * indent + f"  Local  {name} = 0x{val:X}")

        i += 1 + bsize

    return lines, sizes


def main():
    print("=" * 78)
    print("  HID Report Descriptor real del canal RGB (MI_01 & Col04)")
    print("=" * 78)

    h = CreateFileW(HID_PATH, GENERIC_READ, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
        err = GetLastError()
        print(f"  [FAIL] CreateFileW err={err}")
        return 1
    print(f"  [OK] handle=0x{h:X}")

    attrs = HIDD_ATTRIBUTES()
    attrs.Size = ctypes.sizeof(HIDD_ATTRIBUTES)
    if HidD_GetAttributes(h, ctypes.byref(attrs)):
        print(f"  VID=0x{attrs.VendorID:04X} PID=0x{attrs.ProductID:04X} ver=0x{attrs.VersionNumber:04X}")

    prep = ctypes.c_void_p(0)
    if not HidD_GetPreparsedData(h, ctypes.byref(prep)):
        err = GetLastError()
        print(f"  [FAIL] HidD_GetPreparsedData err={err}")
        CloseHandle(h)
        return 1
    print(f"  [OK] preparsed=0x{prep.value:X}")

    # Estructura HIDP_PREPARED_DATA: la，我們 HIDD_PREPARED_DATA tiene cbSize en offset 0
    # y el ReportDescriptor en un offset variable. En Windows, la estructura opaca.
    # Truco: leer la estructura y buscar un puntero valido dentro.
    # Estructura real (hidclass.h), campo ReportDescriptor esta en:
    #   HIDP_PREPARED_DATA { HANDLE hInputReport; HANDLE hOutputReport; HANDLE hFeatureReport;
    #     PVOID FeatureReportByteLength; PVOID FeatureReportBufferCallback; ... }
    # La forma más robusta en la práctica: usar ctypes para leer cbSize y luego
    # encontrar el puntero al descriptor escaneando la estructura.

    # La forma más robusta en la práctica: usar ctypes para leer cbSize y luego
    # encontrar el puntero al descriptor escaneando la estructura.
    buf = ctypes.string_at(prep, 512)
    print(f"  [info] primeros 64 bytes del preparsed data:")
    for row in range(0, 64, 16):
        hexline = " ".join(f"{b:02X}" for b in buf[row:row + 16])
        print(f"    +0x{row:02X}: {hexline}")

    # Extraer el Report Descriptor. HIDP_PREPARED_DATA en win:
    #   typedef struct _HIDP_PREPARED_DATA {
    #     HANDLE hInputReport;          // +0
    #     HANDLE hOutputReport;         // +8
    #     HANDLE hFeatureReport;        // +16
    #     PVOID  lpData;                // +24  <-- HIDP_PRIVATE_DATA
    #   }
    # Y HIDP_PRIVATE_DATA empieza con
    #   ULONG cbSize;                  // +0
    #   ULONG bReportType;             // +4
    #   ... ULONG ReportDescriptorSize; ULONG OffsetReportDescriptor; etc.

    # ReportDescriptorOffset esta en offset 0x1C (28) de HIDP_PRIVATE_DATA
    # y ReportDescriptorSize en 0x20 (32)
    ptrs = []
    for off in range(0, 200, 8):
        val = int.from_bytes(buf[off:off + 8], "little")
        if 0x10000 < val < 0x7FFFFFFFFFFF:
            ptrs.append((off, val))

    print(f"  [info] punteros plausibles en la estructura:")
    for off, val in ptrs:
        print(f"    +0x{off:02X}: 0x{val:016X}")

    # Encontrar el descriptor: HIDP_PRIVATE_DATA tiene ReportDescriptorSize en +0x20
    if len(ptrs) >= 5:
        # tipicamente: hInputReport, hOutputReport, hFeatureReport, lpData
        lp_data = ptrs[3][1]
        lp_data_buf = ctypes.string_at(lp_data, 128)
        print(f"  [info] HIDP_PRIVATE_DATA (lpData=0x{lp_data:016X}) primeros 64 bytes:")
        for row in range(0, 64, 16):
            hexline = " ".join(f"{b:02X}" for b in lp_data_buf[row:row + 16])
            print(f"    +0x{row:02X}: {hexline}")

        # ReportDescriptorSize en +0x20, OffsetReportDescriptor en +0x24
        rd_size = int.from_bytes(lp_data_buf[0x20:0x24], "little")
        rd_off = int.from_bytes(lp_data_buf[0x24:0x28], "little")
        print(f"  [info] ReportDescriptorSize = {rd_size} (0x{rd_size:X})")
        print(f"  [info] OffsetReportDescriptor = {rd_off}")

        if 0 < rd_size < 4096 and 0 < rd_off < rd_size:
            desc = ctypes.string_at(lp_data + rd_off, rd_size)
            print(f"\n  [OK] Report Descriptor ({rd_size} bytes):")
            for row in range(0, min(len(desc), 256), 16):
                hexline = " ".join(f"{b:02X}" for b in desc[row:row + 16])
                ascii_line = "".join(chr(b) if 32 <= b < 127 else "." for b in desc[row:row + 16])
                print(f"    +0x{row:02X}: {hexline:48s} {ascii_line}")

            print(f"\n  === PARSEO ===")
            lines, sizes = parse_descriptor(desc)
            for ln in lines:
                print(ln)

            print(f"\n  === TAMANOS DE REPORT POR ReportID ===")
            for rid, (inp, out, feat) in sorted(sizes.items()):
                print(f"    ReportID 0x{rid:02X}: Input={inp // 8} bytes  Output={out // 8} bytes  Feature={feat // 8} bytes")

            print(f"\n  === CONCLUSION ===")
            for rid, (inp, out, feat) in sorted(sizes.items()):
                print(f"    ReportID 0x{rid:02X}: el plugin DEBERIA escribir {out // 8} bytes, no 64!")
    else:
        print("  [WARN] no se pudo localizar HIDP_PRIVATE_DATA")

    HidD_FreePreparsedData(prep)
    CloseHandle(h)
    return 0


if __name__ == "__main__":
    sys.exit(main())