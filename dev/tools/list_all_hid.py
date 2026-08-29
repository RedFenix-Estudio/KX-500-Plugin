"""list_all_hid.py - Lista TODOS los paths HID (no solo \\?\HID#) y todos los USB devices."""
import ctypes
import ctypes.wintypes as wt
from ctypes import wintypes
import subprocess

hid = ctypes.WinDLL("hid.dll")
setupapi = ctypes.WinDLL("setupapi.dll")
kernel32 = ctypes.WinDLL("kernel32")

# Bindings
HidD_GetHidGuid = hid.HidD_GetHidGuid
HidD_GetHidGuid.argtypes = [ctypes.POINTER(ctypes.c_byte * 16)]
HidD_GetHidGuid.restype = None

CreateFileA = kernel32.CreateFileA
CreateFileA.argtypes = [ctypes.c_char_p, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
CreateFileA.restype = wintypes.HANDLE
CloseHandle = kernel32.CloseHandle
CloseHandle.argtypes = [wintypes.HANDLE]
CloseHandle.restype = wintypes.BOOLEAN
GetLastError = kernel32.GetLastError
GetLastError.argtypes = []
GetLastError.restype = wintypes.DWORD

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
DIGCF_ALLCLASSES = 0x4

print("=" * 80)
print("HID paths completos encontrados:")
print("=" * 80)

hid_guid = (ctypes.c_byte * 16)()
HidD_GetHidGuid(hid_guid)

# Probar con diferentes flags
for flags_name, flags in [("DIGCF_PRESENT|DIGCF_DEVICEINTERFACE", DIGCF_PRESENT | DIGCF_DEVICEINTERFACE), ("DIGCF_ALLCLASSES", DIGCF_ALLCLASSES)]:
    print(f"\n[Flags: {flags_name}]")
    hdevinfo = SetupDiGetClassDevs(ctypes.cast(hid_guid, ctypes.c_void_p), None, None, flags)
    if not hdevinfo or hdevinfo == INVALID_HANDLE_VALUE:
        err = GetLastError()
        print(f"  ERROR: SetupDiGetClassDevs fallo err={err}")
        continue

    paths = set()
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
        p = detail.DevicePath.decode("ascii", errors="replace")
        if p and p not in paths:
            paths.add(p)
    print(f"  Total paths: {len(paths)}")
    for p in sorted(paths):
        # Intentar abrir
        h = CreateFileA(p.encode("ascii"), GENERIC_READ, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
        if h and h != INVALID_HANDLE_VALUE:
            CloseHandle(h)
            status = "OPEN OK"
        else:
            status = f"err={GetLastError()}"
        # Marcar paths sospechosos
        flag = ""
        pl = p.lower()
        if "320f" in pl or "5008" in pl or "checkpoint" in pl or "kx-500" in pl or "favorit" in pl or "fwcustom" in pl:
            flag = "  <-- POSIBLE KX-500"
        print(f"    {p[:120]}{'...' if len(p) > 120 else ''}  [{status}]{flag}")

# Tambien buscar devices con "HID" en el nombre
print()
print("=" * 80)
print("Buscando 'CHECKPOINT' o 'KX' en devices via wmic...")
print("=" * 80)
try:
    out = subprocess.run(["wmic", "path", "Win32_PnPEntity", "where", "Caption like '%HID%'", "get", "Caption,DeviceID", "/format:list"], capture_output=True, text=True, timeout=15)
    print(out.stdout[:3000])
except Exception as e:
    print(f"  wmic fallo: {e}")
