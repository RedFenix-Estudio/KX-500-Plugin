"""diagnose_hid.py - Lista TODOS los HID devices presentes, con VID/PID/path/usage."""
import ctypes
import ctypes.wintypes as wt
from ctypes import wintypes

hid = ctypes.WinDLL("hid.dll")
setupapi = ctypes.WinDLL("setupapi.dll")
kernel32 = ctypes.WinDLL("kernel32")

# Bindings (igual que test_hidsetfeature.py)
HidD_GetHidGuid = hid.HidD_GetHidGuid
HidD_GetHidGuid.argtypes = [ctypes.POINTER(ctypes.c_byte * 16)]
HidD_GetHidGuid.restype = None

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
HidD_GetPreparsedData = hid.HidD_GetPreparsedData
HidD_GetPreparsedData.argtypes = [wintypes.HANDLE, ctypes.POINTER(ctypes.c_void_p)]
HidD_GetPreparsedData.restype = wintypes.BOOLEAN
HidD_FreePreparsedData = hid.HidD_FreePreparsedData
HidD_FreePreparsedData.argtypes = [ctypes.c_void_p]
HidD_FreePreparsedData.restype = wintypes.BOOLEAN
HidP_GetCaps = hid.HidP_GetCaps
HidP_GetCaps.argtypes = [ctypes.c_void_p, ctypes.POINTER(HIDP_CAPS)]
HidP_GetCaps.restype = ctypes.c_long

CreateFileA = kernel32.CreateFileA
CreateFileA.argtypes = [ctypes.c_char_p, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
CreateFileA.restype = wintypes.HANDLE
CloseHandle = kernel32.CloseHandle
CloseHandle.argtypes = [wintypes.HANDLE]
CloseHandle.restype = wintypes.BOOLEAN
GetLastError = kernel32.GetLastError

SetupDiGetClassDevs = setupapi.SetupDiGetClassDevsA
SetupDiGetClassDevs.argtypes = [ctypes.c_void_p, ctypes.c_char_p, wintypes.HWND, wintypes.DWORD]
SetupDiGetClassDevs.restype = wintypes.HANDLE

class SP_DEVICE_INTERFACE_DATA(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_ulong), ("InterfaceClassGuid", ctypes.c_byte * 16), ("Flags", ctypes.c_ulong), ("Reserved", ctypes.c_void_p)]
SetupDiEnumDeviceInterfaces = setupapi.SetupDiEnumDeviceInterfaces
SetupDiEnumDeviceInterfaces.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(SP_DEVICE_INTERFACE_DATA)]
SetupDiEnumDeviceInterfaces.restype = wintypes.BOOLEAN

class SP_DEVICE_INTERFACE_DETAIL_DATA(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_ulong), ("DevicePath", ctypes.c_char * 260)]
SetupDiGetDeviceInterfaceDetail = setupapi.SetupDiGetDeviceInterfaceDetailA
SetupDiGetDeviceInterfaceDetail.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.POINTER(SP_DEVICE_INTERFACE_DATA), ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.c_void_p]
SetupDiGetDeviceInterfaceDetail.restype = wintypes.BOOLEAN

INVALID_HANDLE_VALUE = -1
GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3
DIGCF_PRESENT = 0x2
DIGCF_DEVICEINTERFACE = 0x10

print("=" * 80)
print("HID devices presentes (VID/PID/Usage/Path):")
print("=" * 80)

hid_guid = (ctypes.c_byte * 16)()
HidD_GetHidGuid(hid_guid)
hdevinfo = SetupDiGetClassDevs(ctypes.cast(hid_guid, ctypes.c_void_p), None, None, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE)
if not hdevinfo or hdevinfo == INVALID_HANDLE_VALUE:
    print(f"ERROR: SetupDiGetClassDevs fallo err={GetLastError()}")
    raise SystemExit(1)

found = []
index = 0
while True:
    iface = SP_DEVICE_INTERFACE_DATA()
    iface.cbSize = ctypes.sizeof(SP_DEVICE_INTERFACE_DATA)
    if not SetupDiEnumDeviceInterfaces(hdevinfo, None, hid_guid, index, iface):
        break
    index += 1
    needed = ctypes.c_ulong(0)
    SetupDiGetDeviceInterfaceDetail(hdevinfo, None, iface, None, 0, ctypes.byref(needed), None)
    if needed.value == 0:
        continue
    detail = SP_DEVICE_INTERFACE_DETAIL_DATA()
    detail.cbSize = ctypes.sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA)
    if not SetupDiGetDeviceInterfaceDetail(hdevinfo, None, iface, ctypes.byref(detail), needed, None, None):
        continue
    path = detail.DevicePath.decode("ascii", errors="replace")
    if not path.startswith("\\\\?\\HID#"):
        continue
    h = CreateFileA(path.encode("ascii"), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if h == INVALID_HANDLE_VALUE or not h:
        continue
    try:
        attrs = HIDD_ATTRIBUTES()
        attrs.Size = ctypes.sizeof(HIDD_ATTRIBUTES)
        if not HidD_GetAttributes(h, ctypes.byref(attrs)):
            continue
        vid, pid, ver = attrs.VendorID, attrs.ProductID, attrs.VersionNumber
        prep = ctypes.c_void_p(0)
        caps = None
        if HidD_GetPreparsedData(h, ctypes.byref(prep)):
            caps = HIDP_CAPS()
            if HidP_GetCaps(prep, ctypes.byref(caps)) != 0:
                caps = None
            HidD_FreePreparsedData(prep)
        usage_pg = f"0x{caps.UsagePage:04X}" if caps else "?"
        usage = f"0x{caps.Usage:04X}" if caps else "?"
        feat_len = caps.FeatureReportByteLength if caps else 0
        out_len = caps.OutputReportByteLength if caps else 0
        in_len = caps.InputReportByteLength if caps else 0
        found.append((vid, pid, ver, usage_pg, usage, feat_len, out_len, in_len, path))
    finally:
        CloseHandle(h)

# Ordenar por VID/PID
found.sort()
for vid, pid, ver, up, u, f, o, i, p in found:
    flag = "  <-- POSIBLE KX-500" if vid in (0x320F, 0x04D9) or pid in (0x5008, 0xA1CD) else ""
    print(f"  VID=0x{vid:04X} PID=0x{pid:04X} ver=0x{ver:04X} UsagePage={up} Usage={u} Feat={f} Out={o} In={i}{flag}")
    print(f"      {p}")

print()
print(f"Total: {len(found)} HID devices")
print()
print("UsagePages comunes:")
print("  0x01 = Generic Desktop")
print("  0x05 = Game Controls")
print("  0x06 = Generic Device Controls")
print("  0x07 = Keyboard/Keypad")
print("  0x09 = Button")
print("  0x0C = Consumer")
print("  0x0D = Digitizer")
