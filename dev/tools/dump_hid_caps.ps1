# ============================================================
# Diagnostico HID del KX-500
# Lee el HID Report Descriptor y capabilities del device
# conectado en VID=0x320F PID=0x5008
# ============================================================
# Ejecutar: powershell -NoProfile -ExecutionPolicy Bypass -File dump_hid_caps.ps1
#
# Salida esperada:
#   - Path del device HID
#   - Tamanio del Output Report (caps.OutputReportByteLength)
#   - Si tiene Report ID o no
#   - Listado de capabilities (Input/Output/Feature report byte length)
#   - Primeras lineas del HID Report Descriptor
# ============================================================

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public class HidDiag {
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
    public static extern bool HidD_GetRawInputBuffer(IntPtr hidDevice, IntPtr buffer, ref int bufferLength);

    [DllImport("hid.dll", SetLastError = true)]
    public static extern void HidD_FreePreparsedData(IntPtr preparsedData);

    [DllImport("setupapi.dll", SetLastError = true)]
    public static extern IntPtr SetupDiGetClassDevs(ref Guid classGuid, IntPtr enumerator, IntPtr hwndParent, uint flags);

    [DllImport("setupapi.dll", SetLastError = true)]
    public static extern bool SetupDiEnumDeviceInterfaces(IntPtr deviceInfoSet, IntPtr deviceInfoData, ref Guid interfaceClassGuid, uint memberIndex, ref SP_DEVICE_INTERFACE_DATA deviceInterfaceData);

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

    [DllImport("setupapi.dll", SetLastError = true)]
    public static extern bool SetupDiGetDeviceInterfaceDetail(IntPtr deviceInfoSet, ref SP_DEVICE_INTERFACE_DATA deviceInterfaceData, ref SP_DEVICE_INTERFACE_DETAIL_DATA deviceInterfaceDetailData, int deviceInterfaceDetailDataSize, ref int requiredSize, IntPtr deviceInfoData);

    [DllImport("setupapi.dll", SetLastError = true)]
    public static extern void SetupDiDestroyDeviceInfoList(IntPtr deviceInfoSet);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern IntPtr CreateFile(string lpFileName, IntPtr dwDesiredAccess, IntPtr dwShareMode, IntPtr lpSecurityAttributes, IntPtr dwCreationDisposition, IntPtr dwFlagsAndAttributes, IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool CloseHandle(IntPtr hObject);
}
"@

$TARGET_VID = 0x320F
$TARGET_PID = 0x5008
# Usar .NET FileAccess y FileShare directamente
$FILE_ACCESS_RW = [System.IO.FileAccess]::ReadWrite
$FILE_SHARE_RW = [System.IO.FileShare]::ReadWrite
$FILE_MODE_OPEN = [System.IO.FileMode]::Open

$guid = [Guid]::Empty
[HidDiag]::HidD_GetHidGuid([ref]$guid) | Out-Null

$devs = [HidDiag]::SetupDiGetClassDevs([ref]$guid, [IntPtr]::Zero, [IntPtr]::Zero, [uint32]0x10)
$index = 0
$found = $false

Write-Host "Buscando KX-500 (VID=0x$($TARGET_VID.ToString('X4')) PID=0x$($TARGET_PID.ToString('X4')))..." -ForegroundColor Cyan
Write-Host ""

while ($true) {
    $ifdata = New-Object HidDiag+SP_DEVICE_INTERFACE_DATA
    $ifdata.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($ifdata)
    if (-not [HidDiag]::SetupDiEnumDeviceInterfaces($devs, [IntPtr]::Zero, [ref]$guid, $index, [ref]$ifdata)) {
        break
    }
    $index++

    $reqSize = 0
    [HidDiag]::SetupDiGetDeviceInterfaceDetail($devs, [ref]$ifdata, [ref]([HidDiag+SP_DEVICE_INTERFACE_DETAIL_DATA]::new()), 0, [ref]$reqSize, [IntPtr]::Zero) | Out-Null
    $detail = New-Object HidDiag+SP_DEVICE_INTERFACE_DETAIL_DATA
    $detail.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf([Type]'HidDiag+SP_DEVICE_INTERFACE_DETAIL_DATA') 
    if ($detail.cbSize -eq 0) { $detail.cbSize = 8 } # fallback for x64
    [HidDiag]::SetupDiGetDeviceInterfaceDetail($devs, [ref]$ifdata, [ref]$detail, $reqSize, [ref]$reqSize, [IntPtr]::Zero) | Out-Null
    
    $path = $detail.DevicePath
    $h = [HidDiag]::CreateFile($path, [IntPtr]0xC0000000, [IntPtr]0x3, [IntPtr]::Zero, [IntPtr]3, [IntPtr]0, [IntPtr]::Zero)
    if ($h -eq [IntPtr]-1) { continue }

    $attrs = New-Object HidDiag+HIDD_ATTRIBUTES
    $attrs.Size = [System.Runtime.InteropServices.Marshal]::SizeOf($attrs)
    [HidDiag]::HidD_GetAttributes($h, [ref]$attrs) | Out-Null

    if ($attrs.VendorID -eq $TARGET_VID -and $attrs.ProductID -eq $TARGET_PID) {
        $found = $true
        Write-Host "=== DEVICE ENCONTRADO ===" -ForegroundColor Green
        Write-Host "Path:        $path"
        Write-Host "VID:         0x$($attrs.VendorID.ToString('X4'))"
        Write-Host "PID:         0x$($attrs.ProductID.ToString('X4'))"
        Write-Host "Version:     0x$($attrs.VersionNumber.ToString('X4'))"
        Write-Host "Handle open: $($h -ne [IntPtr]-1)"
        Write-Host ""

        $preparsed = [IntPtr]::Zero
        if ([HidDiag]::HidD_GetPreparsedData($h, [ref]$preparsed)) {
            $caps = New-Object HidDiag+HIDP_CAPS
            $r = [HidDiag]::HidP_GetCaps($preparsed, [ref]$caps)
            if ($r -eq 0) {
                Write-Host "=== HID CAPABILITIES ===" -ForegroundColor Green
                Write-Host "Usage Page:           0x$($caps.UsagePage.ToString('X4'))"
                Write-Host "Usage:                0x$($caps.Usage.ToString('X4'))"
                Write-Host "Input Report Length:  $($caps.InputReportByteLength) bytes"
                Write-Host "Output Report Length: $($caps.OutputReportByteLength) bytes"
                Write-Host "Feature Report Length:$($caps.FeatureReportByteLength) bytes"
                Write-Host "NumberInputValueCaps: $($caps.NumberInputValueCaps)"
                Write-Host "NumberOutputValueCaps:$($caps.NumberOutputValueCaps)"
                Write-Host "NumberFeatureValueCaps:$($caps.NumberFeatureValueCaps)"
                Write-Host ""
                Write-Host "=== INTERPRETACION ===" -ForegroundColor Yellow
                if ($caps.OutputReportByteLength -eq 64) {
                    Write-Host "Output Report = 64 bytes"
                    Write-Host "  - Si el primer byte es 0x04 al escribir, el device TIENE Report ID 0x04"
                    Write-Host "    -> envia 64 bytes con byte 0 = 0x04"
                } elseif ($caps.OutputReportByteLength -eq 65) {
                    Write-Host "Output Report = 65 bytes (Report ID + 64 data)"
                    Write-Host "  -> envia 65 bytes con byte 0 = Report ID, bytes 1-64 = data"
                } else {
                    Write-Host "Output Report = $($caps.OutputReportByteLength) bytes (NO es 64 ni 65)"
                    Write-Host "  -> necesita otro tamano, no el que asume el plugin"
                }
            }
            [HidDiag]::HidD_FreePreparsedData($preparsed) | Out-Null
        }

        # Test: intentar un write de 64 bytes para ver que error code devuelve
        Write-Host ""
        Write-Host "=== TEST WRITE (diagnostico) ===" -ForegroundColor Cyan
        $testBuf = New-Object byte[] 64
        for ($i=0; $i -lt 64; $i++) { $testBuf[$i] = 0 }
        $testBuf[0] = 0x04
        $testBuf[1] = 0x01
        $testBuf[2] = 0x00
        $testBuf[3] = 0x01
        $writeR = 0
        $written = 0
        try {
            $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::ReadWrite)
            try {
                $fs.Write($testBuf, 0, 64)
                $fs.Flush()
                Write-Host "Write 64B: OK" -ForegroundColor Green
            } catch [System.ComponentModel.Win32Exception] {
                $err = $_.Exception.NativeErrorCode
                Write-Host "Write 64B: FALLO Win32 error=$err (0x$($err.ToString('X4')))" -ForegroundColor Red
                Write-Host "  Exception: $($_.Exception.Message)"
            } finally {
                $fs.Close()
            }
        } catch {
            Write-Host "No se pudo abrir el archivo: $($_.Exception.Message)" -ForegroundColor Red
        }
        Write-Host ""
        [HidDiag]::CloseHandle($h) | Out-Null
    } else {
        [HidDiag]::CloseHandle($h) | Out-Null
    }
}

[HidDiag]::SetupDiDestroyDeviceInfoList($devs) | Out-Null

if (-not $found) {
    Write-Host "NO se encontro el KX-500. Conectalo o verifica que el driver este cargado." -ForegroundColor Red
}
