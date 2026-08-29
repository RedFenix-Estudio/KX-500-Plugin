"""raw_input_list.py - Lista devices HID via GetRawInputDeviceList (API mas simple)."""
import ctypes
from ctypes import wintypes

user32 = ctypes.WinDLL("user32")

class RAWINPUTDEVICELIST(ctypes.Structure):
    _fields_ = [
        ("hDevice", wintypes.HANDLE),
        ("dwType", wintypes.DWORD),
    ]

GetRawInputDeviceList = user32.GetRawInputDeviceList
GetRawInputDeviceList.argtypes = [ctypes.POINTER(RAWINPUTDEVICELIST), ctypes.POINTER(wintypes.UINT), wintypes.UINT]
GetRawInputDeviceList.restype = wintypes.UINT

GetRawInputDeviceInfo = user32.GetRawInputDeviceInfoA
GetRawInputDeviceInfo.argtypes = [wintypes.HANDLE, wintypes.UINT, ctypes.c_void_p, ctypes.POINTER(wintypes.UINT)]
GetRawInputDeviceInfo.restype = wintypes.UINT

RIDI_DEVICENAME = 0x20000007
RIDI_DEVICEINFO = 0x2000000B

class RID_DEVICE_INFO_KEYBOARD(ctypes.Structure):
    _fields_ = [("dwType", wintypes.DWORD), ("dwSubType", wintypes.DWORD), ("dwKeyboardMode", wintypes.DWORD), ("dwNumberOfKeys", wintypes.DWORD), ("dwNumberOfIndicators", wintypes.DWORD), ("dwNumberOfTotalKeys", wintypes.DWORD)]

class RID_DEVICE_INFO_MOUSE(ctypes.Structure):
    _fields_ = [("dwId", wintypes.DWORD), ("dwNumberOfButtons", wintypes.DWORD), ("dwSampleRate", wintypes.DWORD), ("fHasHorizontalWheel", wintypes.BOOL)]

class RID_DEVICE_INFO_HID(ctypes.Structure):
    _fields_ = [("dwVendorId", wintypes.DWORD), ("dwProductId", wintypes.DWORD), ("dwVersionNumber", wintypes.DWORD), ("usUsagePage", wintypes.WORD), ("usUsage", wintypes.WORD)]

# Get count
n = wintypes.UINT(0)
GetRawInputDeviceList(None, ctypes.byref(n), ctypes.sizeof(RAWINPUTDEVICELIST))
print(f"Total devices: {n.value}")

if n.value == 0:
    print("No hay devices HID conectados al Raw Input system")
    raise SystemExit(0)

# Allocate array
arr = (RAWINPUTDEVICELIST * n.value)()
n2 = wintypes.UINT(n.value)
ret = GetRawInputDeviceList(arr, ctypes.byref(n2), ctypes.sizeof(RAWINPUTDEVICELIST))
print(f"Realmente listados: {ret}")
print("=" * 80)

for i in range(ret):
    dev = arr[i]
    type_names = {1: "RIM_TYPEKEYBOARD", 2: "RIM_TYPEMOUSE", 3: "RIM_TYPEHID"}
    type_name = type_names.get(dev.dwType, f"TIPO_{dev.dwType}")
    # Get device name
    name_len = wintypes.UINT(0)
    GetRawInputDeviceInfo(dev.hDevice, RIDI_DEVICENAME, None, ctypes.byref(name_len))
    if name_len.value == 0:
        name = ""
    else:
        name_buf = ctypes.create_string_buffer(name_len.value)
        GetRawInputDeviceInfo(dev.hDevice, RIDI_DEVICENAME, name_buf, ctypes.byref(name_len))
        name = name_buf.value.decode("ascii", errors="replace")
    # Get device info
    info = RID_DEVICE_INFO_HID()
    info_len = wintypes.UINT(ctypes.sizeof(info))
    GetRawInputDeviceInfo(dev.hDevice, RIDI_DEVICEINFO, ctypes.byref(info), ctypes.byref(info_len))
    flag = ""
    if info.dwVendorId != 0 or info.dwProductId != 0:
        vid, pid = info.dwVendorId, info.dwProductId
        up, u = info.usUsagePage, info.usUsage
        if vid in (0x320F, 0x04D9) or pid in (0x5008, 0xA1CD):
            flag = "  <-- POSIBLE KX-500"
        print(f"  [{i:2d}] {type_name}  VID=0x{vid:04X} PID=0x{pid:04X} ver=0x{info.dwVersionNumber:04X} UsagePage=0x{up:04X} Usage=0x{u:04X}{flag}")
    else:
        print(f"  [{i:2d}] {type_name}  (no HID info)")
    if name:
        print(f"        name: {name}")
