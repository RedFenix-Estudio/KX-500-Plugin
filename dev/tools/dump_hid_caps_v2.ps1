# ============================================================
# Diagnostico HID del KX-500 — v2 (mas robusto)
# Usa PnP device enumeration + setupapi directo
# ============================================================

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class HidDiag2 {
    [StructLayout(LayoutKind.Sequential)]
    public struct HIDD_ATTRIBUTES {
        public int Size;
        public ushort VendorID;
        public ushort ProductID;
        public ushort VersionNumber;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HIDP_CAPS {
        public ushort Usage;
        public ushort UsagePage;
        public ushort InputReportByteLength;
        public ushort OutputReportByteLength;
        public ushort FeatureReportByteLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)]
        public ushort[] Reserved;
        public ushort NumberLinkCollectionNodes;
        public ushort NumberInputButtonCaps;
        public ushort NumberInputValueCaps;
        public ushort NumberInputDataIndices;
        public ushort NumberOutputButtonCaps;
        public ushort NumberOutputValueCaps;
        public ushort NumberOutputDataIndices;
        public ushort NumberFeatureButtonCaps;
        public ushort NumberFeatureValueCaps;
        public ushort NumberFeatureDataIndices;
    }

    [DllImport("hid.dll", SetLastError = true)]
    public static extern void HidD_GetHidGuid(out Guid hidGuid);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern bool HidD_GetAttributes(IntPtr hidDevice, out HIDD_ATTRIBUTES attributes);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern bool HidD_GetPreparsedData(IntPtr hidDevice, out IntPtr preparsedData);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern int HidP_GetCaps(IntPtr preparsedData, out HIDP_CAPS capabilities);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern void HidD_FreePreparsedData(IntPtr preparsedData);

    [StructLayout(LayoutKind.Sequential)]
    public struct SP_DEVICE_INTERFACE_DATA {
        public int cbSize;
        public Guid interfaceClassGuid;
        public uint flags;
        public IntPtr reserved;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct SP_DEVICE_INTERFACE_DETAIL_DATA {
        public int cbSize;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string DevicePath;
    }

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr SetupDiGetClassDevs(ref Guid classGuid, string enumerator, IntPtr hwndParent, uint flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    public static extern bool SetupDiEnumDeviceInterfaces(IntPtr deviceInfoSet, IntPtr deviceInfoData, ref Guid interfaceClassGuid, uint memberIndex, ref SP_DEVICE_INTERFACE_DATA deviceInterfaceData);

    [DllImport("setupapi.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr deviceInfoSet, ref SP_DEVICE_INTERFACE_DATA deviceInterfaceData, IntPtr deviceInterfaceDetailData, int deviceInterfaceDetailDataSize, ref int requiredSize, IntPtr deviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    public static extern void SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern IntPtr CreateFile(string lpFileName, IntPtr dwDesiredAccess, IntPtr dwShareMode, IntPtr lpSecurityAttributes, IntPtr dwCreationDisposition, IntPtr dwFlagsAndAttributes, IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);
}
"@ -ReferencedAssemblies System.Runtime.InteropServices

# IntPtr sizes para x64
$cbSizeInterfaceData = [System.Runtime.InteropServices.Marshal]::SizeOf([Type]'HidDiag2+SP_DEVICE_INTERFACE_DATA')
$cbSizeInterfaceDetail = [IntPtr]::Size + 4  # 8 en x64 (size del puntero + 4 bytes)
Write-Host "Arquitectura: $(if ([System.Environment]::Is64BitProcess) { 'x64' } else { 'x86' })"
Write-Host "cbSizeInterfaceData: $cbSizeInterfaceData, cbSizeInterfaceDetail: $cbSizeInterfaceDetail"
Write-Host ""

# Primero: listar TODOS los HID devices via PnP (no falla)
Write-Host "=== HID DEVICES por PnP (solo los que matchean KX-500) ===" -ForegroundColor Cyan
$hids = Get-PnpDevice -Class HIDClass -ErrorAction SilentlyContinue | Where-Object {
    $_.InstanceId -like "*VID_320F*PID_5008*"
}
if ($hids) {
    foreach ($d in $hids) {
        Write-Host "  - InstanceId: $($d.InstanceId)"
        Write-Host "    Status:     $($d.Status)"
        Write-Host "    Friendly:   $($d.FriendlyName)"
    }
} else {
    Write-Host "  (ninguno via Get-PnpDevice)" -ForegroundColor Yellow
}
Write-Host ""

# Tambien: por enumeracion SetupAPI (lo que usa SignalRGB)
$guid = [Guid]::Empty
[HidDiag2]::HidD_GetHidGuid([ref]$guid) | Out-Null

$devs = [HidDiag2]::SetupDiGetClassDevs([ref]$guid, $null, [IntPtr]::Zero, [uint32]0x10)
if ($devs -eq [IntPtr]-1) {
    Write-Host "ERROR: SetupDiGetClassDevs fallo: $(([System.ComponentModel.Win32Exception][System.Runtime.InteropServices.Marshal]::GetLastWin32Error()).Message)" -ForegroundColor Red
    exit 1
}

$index = 0
$found = 0
$all = @()

Write-Host "=== ENUMERACION SETUPAPI (todos los HID) ===" -ForegroundColor Cyan
while ($true) {
    $ifdata = New-Object HidDiag2+SP_DEVICE_INTERFACE_DATA
    $ifdata.cbSize = $cbSizeInterfaceData
    if (-not [HidDiag2]::SetupDiEnumDeviceInterfaces($devs, [IntPtr]::Zero, [ref]$guid, [uint32]$index, [ref]$ifdata)) {
        $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        if ($err -ne 259) { # ERROR_NO_MORE_ITEMS
            Write-Host "SetupDiEnumDeviceInterfaces error $err en index $index" -ForegroundColor Red
        }
        break
    }
    $index++

    $reqSize = 0
    [HidDiag2]::SetupDiGetDeviceInterfaceDetail($devs, [ref]$ifdata, [IntPtr]::Zero, 0, [ref]$reqSize, [IntPtr]::Zero) | Out-Null
    if ($reqSize -eq 0) { continue }

    $detailBuf = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($reqSize)
    [HidDiag2]::SetupDiGetDeviceInterfaceDetail($devs, [ref]$ifdata, $detailBuf, $reqSize, [ref]$reqSize, [IntPtr]::Zero) | Out-Null
    # En x64, el primer int es cbSize (4 bytes), el path empieza en offset 4 (no 8 como en algunos docs)
    $ptr = [IntPtr]::Add($detailBuf, 4)
    $path = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($ptr)
    [System.Runtime.InteropServices.Marshal]::FreeHGlobal($detailBuf)

    $all += $path
}
[HidDiag2]::SetupDiDestroyDeviceInfoList($devs) | Out-Null

Write-Host "Total HID devices encontrados: $($all.Count)"
Write-Host ""

$kx500 = $all | Where-Object { $_ -like "*VID_320F*PID_5008*" }
if ($kx500) {
    Write-Host "=== KX-500 HID PATHS ===" -ForegroundColor Green
    foreach ($p in $kx500) {
        Write-Host "  $p"
    }
} else {
    Write-Host "KX-500 NO aparece en la enumeracion SetupAPI." -ForegroundColor Red
    Write-Host "Primeros 5 HID devices de la lista:" -ForegroundColor Yellow
    $all | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" }
}

Write-Host ""
Write-Host "=== Ahora intento abrir cada path del KX-500 ===" -ForegroundColor Cyan

foreach ($p in $kx500) {
    Write-Host ""
    Write-Host "Path: $p" -ForegroundColor Yellow
    # Solo lectura primero para ver VID/PID sin pelear con SignalRGB
    $h = [HidDiag2]::CreateFile($p, [IntPtr]::0xC0000000, [IntPtr]0x3, [IntPtr]::Zero, [IntPtr]3, [IntPtr]0, [IntPtr]::Zero)
    if ($h -eq [IntPtr]-1) {
        $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
        Write-Host "  CreateFile fallo: Win32 error $err" -ForegroundColor Red
        continue
    }
    Write-Host "  Handle abierto OK"

    $attrs = New-Object HidDiag2+HIDD_ATTRIBUTES
    $attrs.Size = [System.Runtime.InteropServices.Marshal]::SizeOf($attrs)
    if (-not [HidDiag2]::HidD_GetAttributes($h, [ref]$attrs)) {
        Write-Host "  HidD_GetAttributes fallo" -ForegroundColor Red
        [HidDiag2]::CloseHandle($h) | Out-Null
        continue
    }
    Write-Host "  VID=0x$($attrs.VendorID.ToString('X4')) PID=0x$($attrs.ProductID.ToString('X4')) Version=0x$($attrs.VersionNumber.ToString('X4'))"

    $preparsed = [IntPtr]::Zero
    if (-not [HidDiag2]::HidD_GetPreparsedData($h, [ref]$preparsed)) {
        Write-Host "  HidD_GetPreparsedData fallo" -ForegroundColor Red
        [HidDiag2]::CloseHandle($h) | Out-Null
        continue
    }
    $caps = New-Object HidDiag2+HIDP_CAPS
    $r = [HidDiag2]::HidP_GetCaps($preparsed, [ref]$caps)
    [HidDiag2]::HidD_FreePreparsedData($preparsed) | Out-Null
    if ($r -ne 0) {
        Write-Host "  HidP_GetCaps fallo con codigo $r" -ForegroundColor Red
        [HidDiag2]::CloseHandle($h) | Out-Null
        continue
    }
    Write-Host "  Usage Page:          0x$($caps.UsagePage.ToString('X4'))" -ForegroundColor Green
    Write-Host "  Usage:               0x$($caps.Usage.ToString('X4'))"
    Write-Host "  Input Report Len:    $($caps.InputReportByteLength) bytes"
    Write-Host "  Output Report Len:   $($caps.OutputReportByteLength) bytes"
    Write-Host "  Feature Report Len:  $($caps.FeatureReportByteLength) bytes"
    Write-Host "  NumberOutputValueCaps: $($caps.NumberOutputValueCaps)"

    # Test write: 64 bytes con Report ID 0x04
    Write-Host ""
    Write-Host "  Test write 64B con byte 0 = 0x04..." -ForegroundColor Cyan
    $testBuf = New-Object byte[] 64
    for ($i=0; $i -lt 64; $i++) { $testBuf[$i] = 0 }
    $testBuf[0] = 0x04
    $testBuf[1] = 0x01
    $testBuf[2] = 0x00
    $testBuf[3] = 0x01
    try {
        $fs = [System.IO.File]::Open($p, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::ReadWrite)
        try {
            $fs.Write($testBuf, 0, 64)
            $fs.Flush()
            Write-Host "    RESULTADO: OK (no dio error)" -ForegroundColor Green
        } catch [System.ComponentModel.Win32Exception] {
            $winerr = $_.Exception.NativeErrorCode
            Write-Host "    RESULTADO: Win32 error=$winerr (0x$($winerr.ToString('X4')))" -ForegroundColor Red
            Write-Host "    Exception: $($_.Exception.Message)"
        } finally {
            $fs.Close()
        }
    } catch {
        Write-Host "    No se pudo abrir como FileStream: $($_.Exception.Message)" -ForegroundColor Red
    }

    [HidDiag2]::CloseHandle($h) | Out-Null
    $found++
}

Write-Host ""
if ($found -eq 0) {
    Write-Host "=== CONCLUSION ===" -ForegroundColor Red
    Write-Host "No pude abrir ningun HID device del KX-500." -ForegroundColor Red
    Write-Host "Causas posibles:"
    Write-Host "  1. SignalRGB tiene los handles abiertos en modo exclusivo"
    Write-Host "  2. El driver de Checkpoint monopoliza el device (HidServ.exe)"
    Write-Host "  3. El KX-500 no responde (apagado, cable malo)"
    Write-Host ""
    Write-Host "Proba: cerrar SignalRGB, luego correr este script de nuevo."
}
