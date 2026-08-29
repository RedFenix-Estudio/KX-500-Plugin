"""probe_kernel_driver.py - Investiga el driver de kernel que intercepta el KX-500."""
import ctypes
import subprocess
import sys
from ctypes import wintypes

kernel32 = ctypes.WinDLL("kernel32")

CreateFileW = kernel32.CreateFileW
CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
CreateFileW.restype = wintypes.HANDLE

WriteFile = kernel32.WriteFile
WriteFile.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
WriteFile.restype = wintypes.BOOLEAN

DeviceIoControl = kernel32.DeviceIoControl
DeviceIoControl.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
DeviceIoControl.restype = wintypes.BOOLEAN

CloseHandle = kernel32.CloseHandle
GetLastError = kernel32.GetLastError

GENERIC_READ = 0x80000000
GENERIC_WRITE = 0x40000000
FILE_SHARE_RW = 0x3
OPEN_EXISTING = 3
OPEN_ALWAYS = 4
INVALID_HANDLE_VALUE = 0xFFFFFFFFFFFFFFFF  # 64-bit signed -1

# Paths custom comunes en drivers de teclado
CUSTOM_PATHS = [
    r"\\.\FwCustom",
    r"\\.\HidServ",
    r"\\.\Global\FwCustom",
    r"\\.\CHECKPOINT_KX_500",
    r"\\.\CHECKPOINT",
    r"\\.\KX500",
    r"\\.\KX-500",
    r"\\.\Favorit",
]

# IOCTLs comunes (METHOD_BUFFERED, FILE_ANY_ACCESS)
# 0x00222000 = CTL_CODE(FILE_DEVICE_UNKNOWN, 0x800, METHOD_BUFFERED, FILE_ANY_ACCESS)
# 0x00222004 = 0x801
IOCTL_COMMON = [
    0x00222000, 0x00222004, 0x00222008, 0x0022200C,
    0x00222010, 0x00222014, 0x00222018, 0x0022201C,
    0x00222020, 0x00222024, 0x00222028, 0x0022202C,
    0x00222040, 0x00222044, 0x00222048, 0x0022204C,
]

print("=" * 80)
print("Parte 1: Verificar si hay driver de kernel instalado (sc query)")
print("=" * 80)
try:
    out = subprocess.run(["sc", "query", "type=", "kernel"], capture_output=True, text=True, timeout=10)
    if out.returncode == 0:
        # Buscar servicios relacionados con KX500/FwCustom/CheckPoint
        for line in out.stdout.splitlines():
            ll = line.lower()
            if any(k in ll for k in ["fwcustom", "hidserv", "kx-500", "kx500", "checkpoint", "favorit"]):
                print(f"  [MATCH] {line}")
except FileNotFoundError:
    print("  sc no disponible")

print()
print("=" * 80)
print("Parte 2: Probar paths custom con CreateFileW")
print("=" * 80)
for path in CUSTOM_PATHS:
    h = CreateFileW(
        path,
        GENERIC_READ | GENERIC_WRITE,
        FILE_SHARE_RW,
        None, OPEN_EXISTING, 0, None
    )
    if h == INVALID_HANDLE_VALUE or not h:
        err = GetLastError()
        print(f"  [FAIL] {path:35s} err={err}")
        continue
    print(f"  [OK]   {path:35s} handle=0x{h:X}")
    # Probar WriteFile simple
    test = bytearray(64)
    test[0] = 0x04
    test[1] = 0x99
    test[2] = 0x01
    test[3] = 0x06
    test[4] = 0x03
    test[5] = 0x05
    test[6] = 0x00
    test[7] = 0x00
    test[8] = 0xFF  # R
    test[9] = 0x00
    test[10] = 0x00
    tb = ctypes.create_string_buffer(bytes(test), 64)
    written = wintypes.DWORD(0)
    ok = WriteFile(h, ctypes.byref(tb), 64, ctypes.byref(written), None)
    err = GetLastError()
    if ok and written.value == 64:
        print(f"          WriteFile OK! ({written.value}/64 bytes escritos)")
    else:
        print(f"          WriteFile: {'OK' if ok else 'FAIL'} err={err} written={written.value}/64")
    # Probar DeviceIoControl con algunos IOCTLs
    print(f"          Probando DeviceIoControl con IOCTLs comunes...")
    for ioctl in IOCTL_COMMON[:4]:
        in_buf = ctypes.create_string_buffer(64)
        out_buf = ctypes.create_string_buffer(64)
        bytes_ret = wintypes.DWORD(0)
        ok2 = DeviceIoControl(h, ioctl, ctypes.byref(in_buf), 64, ctypes.byref(out_buf), 64, ctypes.byref(bytes_ret), None)
        err2 = GetLastError()
        if ok2:
            print(f"            IOCTL 0x{ioctl:08X}: OK ({bytes_ret.value}B)")
    CloseHandle(h)

print()
print("=" * 80)
print("Parte 3: Buscar devices en el Registry (HKLM\\SYSTEM\\CurrentControlSet\\Enum)")
print("=" * 80)
import winreg
try:
    key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Services")
    i = 0
    found = []
    while True:
        try:
            name = winreg.EnumKey(key, i)
            ll = name.lower()
            if any(k in ll for k in ["fwcustom", "hidserv", "kx500", "kx-500", "checkpoint", "favorit"]):
                found.append(name)
            i += 1
        except OSError:
            break
    winreg.CloseKey(key)
    if found:
        for name in found:
            print(f"  [FOUND] Service: {name}")
    else:
        print("  No se encontraron servicios relacionados con KX-500/FwCustom/CheckPoint en Services")
except Exception as e:
    print(f"  Error leyendo Services: {e}")

# Tambien buscar en Enum (devices de clase)
try:
    key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SYSTEM\CurrentControlSet\Enum")
    for sub in ["USB", "HID"]:
        try:
            subkey = winreg.OpenKey(key, sub)
            i = 0
            while True:
                try:
                    dev_id = winreg.EnumKey(subkey, i)
                    if "320f" in dev_id.lower() or "5008" in dev_id.lower():
                        print(f"  [FOUND] {sub}\\{dev_id}")
                        try:
                            dev_key = winreg.OpenKey(subkey, dev_id)
                            j = 0
                            while True:
                                try:
                                    inst = winreg.EnumKey(dev_key, j)
                                    inst_key = winreg.OpenKey(dev_key, inst)
                                    try:
                                        desc, _ = winreg.QueryValueEx(inst_key, "DeviceDesc")
                                        print(f"          {inst}  DeviceDesc={desc}")
                                    except FileNotFoundError:
                                        pass
                                    try:
                                        svc, _ = winreg.QueryValueEx(inst_key, "Service")
                                        print(f"          {inst}  Service={svc}")
                                    except FileNotFoundError:
                                        pass
                                    j += 1
                                except OSError:
                                    break
                            winreg.CloseKey(dev_key)
                        except Exception as e:
                            pass
                    i += 1
                except OSError:
                    break
            winreg.CloseKey(subkey)
        except FileNotFoundError:
            pass
    winreg.CloseKey(key)
except Exception as e:
    print(f"  Error leyendo Enum: {e}")
