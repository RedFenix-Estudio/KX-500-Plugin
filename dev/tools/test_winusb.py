# -*- coding: utf-8 -*-
"""
test_winusb.py
===============
PRUEBA DECISIVA: replicar exactamente lo que hace el driver oficial.

Las capturas USBPcap muestran URB_FUNCTION 0x000B = URB_FUNCTION_CLASS_DEVICE,
que es lo que genera la API WinUsb. Este test:

1. Enumera las interfaces USB del KX-500 (GUID_DEVINTERFACE_USB_DEVICE)
2. Abre el device con CreateFile
3. WinUsb_Initialize
4. WinUsb_QueryInterfaceSettings -> lee los pipes
5. WinUsb_WritePipe(pipe 0x03) con el Output Report RGB de 64 bytes
6. Compara con HidD_SetOutputReport

Si WinUsb funciona y WriteFile overlapped no, el cambio a 'rawusb' en
SignalRGB es correcto. Si WinUsb da ACCESS_DENIED, el device esta tomado por
HidUsb.sys y rawusb NO va a funcionar — habria que buscar otra via.

GUID_DEVINTERFACE_USB_DEVICE = {A5DCBF10-6530-11D2-901F-00C04FB951ED}
"""
import ctypes
import sys
from ctypes import wintypes

setupapi = ctypes.WinDLL("setupapi.dll")
kernel32 = ctypes.WinDLL("kernel32")
winusb = ctypes.WinDLL("winusb.dll")
hid = ctypes.WinDLL("hid.dll")

# --- setupapi ---
SetupDiGetClassDevsA = setupapi.SetupDiGetClassDevsA
SetupDiGetClassDevsA.argtypes = [ctypes.c_void_p, ctypes.c_char_p, wintypes.HWND, wintypes.DWORD]
SetupDiGetClassDevsA.restype = wintypes.HANDLE


class SP_DEVICE_INTERFACE_DATA(ctypes.Structure):
    _fields_ = [("cbSize", ctypes.c_ulong), ("ClassGuid", ctypes.c_byte * 16),
                ("Flags", ctypes.c_ulong), ("Reserved", ctypes.c_void_p)]


SetupDiEnumDeviceInterfaces = setupapi.SetupDiEnumDeviceInterfaces
SetupDiEnumDeviceInterfaces.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p,
                                        ctypes.c_ulong, ctypes.POINTER(SP_DEVICE_INTERFACE_DATA)]
SetupDiEnumDeviceInterfaces.restype = wintypes.BOOLEAN

SetupDiGetDeviceInterfaceDetailA = setupapi.SetupDiGetDeviceInterfaceDetailA
SetupDiGetDeviceInterfaceDetailA.argtypes = [wintypes.HANDLE, ctypes.c_void_p,
                                             ctypes.POINTER(SP_DEVICE_INTERFACE_DATA),
                                             ctypes.c_void_p, ctypes.c_ulong,
                                             ctypes.POINTER(ctypes.c_ulong), ctypes.c_void_p]
SetupDiGetDeviceInterfaceDetailA.restype = wintypes.BOOLEAN

# --- kernel32 ---
CreateFileW = kernel32.CreateFileW
CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                        wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
CreateFileW.restype = wintypes.HANDLE
CloseHandle = kernel32.CloseHandle
GetLastError = kernel32.GetLastError

HidD_SetOutputReport = hid.HidD_SetOutputReport
HidD_SetOutputReport.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD]
HidD_SetOutputReport.restype = wintypes.BOOLEAN

# --- winusb ---
WinUsb_Initialize = winusb.WinUsb_Initialize
WinUsb_Initialize.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.HANDLE)]
WinUsb_Initialize.restype = wintypes.BOOLEAN

WinUsb_Free = winusb.WinUsb_Free
WinUsb_Free.argtypes = [wintypes.HANDLE]
WinUsb_Free.restype = wintypes.BOOLEAN


class USB_INTERFACE_DESCRIPTOR(ctypes.Structure):
    _fields_ = [("bLength", ctypes.c_ubyte), ("bDescriptorType", ctypes.c_ubyte),
                ("bInterfaceNumber", ctypes.c_ubyte), ("bAlternateSetting", ctypes.c_ubyte),
                ("bNumEndpoints", ctypes.c_ubyte), ("bInterfaceClass", ctypes.c_ubyte),
                ("bInterfaceSubClass", ctypes.c_ubyte), ("bInterfaceProtocol", ctypes.c_ubyte),
                ("iInterface", ctypes.c_ubyte)]


class WINUSB_PIPE_INFORMATION(ctypes.Structure):
    _fields_ = [("PipeType", ctypes.c_ubyte), ("PipeId", ctypes.c_ubyte),
                ("MaximumPacketSize", ctypes.c_ushort), ("Interval", ctypes.c_ubyte)]


WinUsb_QueryInterfaceSettings = winusb.WinUsb_QueryInterfaceSettings
WinUsb_QueryInterfaceSettings.argtypes = [wintypes.HANDLE, ctypes.c_ubyte,
                                          ctypes.POINTER(USB_INTERFACE_DESCRIPTOR)]
WinUsb_QueryInterfaceSettings.restype = wintypes.BOOLEAN

WinUsb_QueryPipe = winusb.WinUsb_QueryPipe
WinUsb_QueryPipe.argtypes = [wintypes.HANDLE, ctypes.c_ubyte, ctypes.c_ubyte,
                             ctypes.POINTER(WINUSB_PIPE_INFORMATION)]
WinUsb_QueryPipe.restype = wintypes.BOOLEAN

WinUsb_WritePipe = winusb.WinUsb_WritePipe
WinUsb_WritePipe.argtypes = [wintypes.HANDLE, ctypes.c_ubyte, ctypes.c_char_p,
                             ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.c_void_p]
WinUsb_WritePipe.restype = wintypes.BOOLEAN

# GUID_DEVINTERFACE_USB_DEVICE
USB_DEVICE_GUID = bytes([
    0x10, 0xBF, 0xDC, 0xA5, 0x30, 0x65, 0xD2, 0x11,
    0x90, 0x1F, 0x00, 0xC0, 0x4F, 0xB9, 0x51, 0xED,
])

DIGCF_PRESENT = 0x2
DIGCF_DEVICEINTERFACE = 0x10
GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3

HID_PATH = r"\\?\HID#VID_320F&PID_5008&MI_01&Col04#8&1c1f1d2a&0&0003#{4d1e55b2-f16f-11cf-88cb-001111000030}"

PIPE_TYPES = {0: "CONTROL", 1: "ISOCHRONOUS", 2: "BULK", 3: "INTERRUPT"}


def build_solid(r, g, b, seq=0x09):
    buf = [0x04, seq, 0x01, 0x06, 0x03, 0x05, 0x00, 0x00, r, g, b] + [0x00] * 53
    return bytes(buf[:64])


def list_usb_interfaces():
    guid = (ctypes.c_byte * 16).from_buffer_copy(USB_DEVICE_GUID)
    hdev = SetupDiGetClassDevsA(ctypes.byref(guid), None, None,
                                DIGCF_PRESENT | DIGCF_DEVICEINTERFACE)
    if not hdev or hdev == -1:
        print(f"  [FAIL] SetupDiGetClassDevsA err={GetLastError()}")
        return []
    out = []
    idx = 0
    while True:
        ifd = SP_DEVICE_INTERFACE_DATA()
        ifd.cbSize = ctypes.sizeof(SP_DEVICE_INTERFACE_DATA)
        if not SetupDiEnumDeviceInterfaces(hdev, None, ctypes.byref(guid), idx, ctypes.byref(ifd)):
            break
        idx += 1
        need = ctypes.c_ulong(0)
        SetupDiGetDeviceInterfaceDetailA(hdev, None, ctypes.byref(ifd), None, 0,
                                         ctypes.byref(need), None)
        if need.value == 0:
            continue
        det = ctypes.create_string_buffer(need.value)
        detp = ctypes.cast(det, ctypes.POINTER(SP_DEVICE_INTERFACE_DATA))
        # cbSize en 64-bit = 8
        struct.unpack_from("<I", det, 0)[0:1]
        ctypes.memmove(det, ctypes.byref(ctypes.c_ulong(8)), 4)
        if SetupDiGetDeviceInterfaceDetailA(hdev, None, ctypes.byref(ifd), det, need, None, None):
            path = ctypes.string_at(det, need.value).split(b"\x00")[0].decode("ascii", errors="replace")
            out.append(path)
    return out


def main():
    print("=" * 88)
    print("  TEST WINUSB — replicando el transporte del driver oficial")
    print("=" * 88)

    # Path USB directo, tomado del log de SignalRGB:
    #   hid.initialize.verbose - Parent device path: [USB\VID_320F&PID_5008\6&10E627AA&0&1]
    USB_PATHS = [
        r"\\?\USB#VID_320F&PID_5008#6&10E627AA&0&1",
        r"\\?\USB#VID_320F&PID_5008#6&10E627AA&0&1#{A5DCBF10-6530-11D2-901F-00C04FB951ED}",
    ]

    print("\n[1] Probando paths USB conocidos (del log de SignalRGB)...")
    kx = USB_PATHS
    for p in kx:
        print(f"      {p}")

    if not kx:
        print("  [!] No se encontro path USB del KX-500")

    # 2) WinUsb sobre la interface USB
    usb_ok = False
    for p in kx:
        print(f"\n[2] Intentando WinUsb_Initialize en {p[:70]}...")
        h = CreateFileW(p, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
        if not h or h == 0 or h == -1 or h == 0xFFFFFFFFFFFFFFFF:
            print(f"    [FAIL] CreateFileW err={GetLastError()}")
            continue
        print(f"    [OK] handle=0x{h:X}")
        iface = wintypes.HANDLE(0)
        if not WinUsb_Initialize(h, ctypes.byref(iface)):
            err = GetLastError()
            print(f"    [FAIL] WinUsb_Initialize err={err}")
            if err == 5:
                print(f"           ACCESS_DENIED -> la interface USB esta tomada por otro driver")
                print(f"           (probablemente HidUsb.sys). rawusb en SignalRGB NO funcionaria.")
            elif err == 50:
                print(f"           ERROR_NOT_SUPPORTED -> el driver no expone la API WinUsb")
            CloseHandle(h)
            continue
        print(f"    [OK] WinUsb interface=0x{iface.value:X}")
        usb_ok = True

        # 3) interfaces del device
        for alt in range(0, 4):
            desc = USB_INTERFACE_DESCRIPTOR()
            if not WinUsb_QueryInterfaceSettings(iface, alt, ctypes.byref(desc)):
                break
            print(f"    Interface {alt}: class={desc.bInterfaceClass} "
                  f"subclass={desc.bInterfaceSubClass} endpoints={desc.bNumEndpoints}")
            if desc.bInterfaceClass == 0x03:  # HID
                for pipe in range(1, desc.bNumEndpoints + 1):
                    for ptype in (0, 1, 2, 3):
                        pi = WINUSB_PIPE_INFORMATION()
                        if WinUsb_QueryPipe(iface, pipe, ptype, ctypes.byref(pi)):
                            print(f"      pipe id={pi.PipeId:02X} type={PIPE_TYPES.get(ptype, ptype):<12} "
                                  f"maxPacket={pi.MaximumPacketSize} interval={pi.Interval}")

        # 4) escribir al endpoint 0x03
        print("\n[3] WinUsb_WritePipe(endpoint 0x03) con solid RED...")
        payload = build_solid(0xFF, 0x00, 0x00, 0x09)
        written = ctypes.c_ulong(0)
        ok = WinUsb_WritePipe(iface, 0x03, payload, 64, ctypes.byref(written), None)
        err = GetLastError()
        print(f"    WinUsb_WritePipe: {'OK' if ok else 'FAIL'} err={err} written={written.value}/64")

        WinUsb_Free(iface)
        CloseHandle(h)
        break

    # 5) comparacion: HidD_SetOutputReport
    print("\n[4] Comparacion: HidD_SetOutputReport sobre el HID path...")
    hh = CreateFileW(HID_PATH, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_RW, None, OPEN_EXISTING, 0, None)
    if hh and hh != -1 and hh != 0xFFFFFFFFFFFFFFFF:
        buf = ctypes.create_string_buffer(build_solid(0x00, 0xFF, 0x00, 0x0A), 64)
        ok = HidD_SetOutputReport(hh, ctypes.byref(buf), 64)
        print(f"    HidD_SetOutputReport: {'OK' if ok else 'FAIL'} err={GetLastError()}")
        CloseHandle(hh)

    print()
    print("=" * 88)
    if usb_ok:
        print("  RESULTADO: WinUsb FUNCIONA sobre este device.")
        print("  => Cambiar Type() a 'rawusb' en el plugin es la via correcta.")
        print("  => El driver oficial y SignalRGB RAWUSB hablarian el mismo idioma.")
    else:
        print("  RESULTADO: WinUsb NO esta disponible sobre este device.")
        print("  => rawusb en SignalRGB probablementemente NO funcionara.")
        print("  => Habria que buscar la via HID que evite el WriteFile overlapped,")
        print("     o hacer que el firmware acepte el modo actual.")
    print("=" * 88)
    return 0


if __name__ == "__main__":
    sys.exit(main())