# Capturar el header HID real del KX-500

> Guia para encontrar los bytes exactos que el driver oficial envia al KX-500
> para asi calibrar KX500_Lite.js con el comando HID correcto.

---

## Estado actual (26-08-2025)

- ✅ Plugin Lite **detecta** el KX-500 en SignalRGB (probado por Erik)
- ❌ Las luces **NO encienden** — depende del header HID real
- ❌ El header SinoWealth `06 08 00 00 01 00 7A 01` **NO esta** en los binarios del driver oficial
- 🔧 **El plugin tiene 7 presets HID** que se pueden probar desde la UI de SignalRGB

---

## 3 metodos para capturar el header real

### Metodo A: API Monitor (recomendado — facil)

**Tiempo estimado:** 5-10 min

#### Setup (ya hecho en tools/API-Monitor/)

API Monitor de rohitab.com esta descargado en:
```
tools/API-Monitor/apimonitor-x64.exe
```

#### Procedimiento

1. **Ejecutar como Administrador:**
   ```
   Clic derecho sobre tools\API-Monitor\apimonitor-x64.exe → "Run as Administrator"
   ```
   O usar el script que automatiza:
   ```powershell
   cd "RUTA-AL-REPO"
   .\examples\api-monitor-capture.ps1
   ```

2. **Activar Monitoring:**
   ```
   Menu Monitoring -> Enable Monitoring (Ctrl+E)
   ```

3. **Configurar filtros** (CRITICO):
   ```
   Menu Filter -> Filter Rule...
   Module:  hid.dll
   Function: HidD_SetFeature   [x]
   Function: HidD_SetOutputReport  [x]
   ```

4. **Lanzar el driver oficial** (no SignalRGB):
   ```
   C:\Program Files (x86)\CHECKPOINT KX-500\CHECKPOINT_KX_500.exe
   ```
   Si pide admin: "Run as Administrator" tambien.

5. **Aplicar un color solido desde el driver oficial** (cualquier color, RGB puro).

6. **Ver los bytes en API Monitor:**
   - En la ventana principal apareceran multiples llamadas `HidD_SetFeature`
   - Cada llamada tiene parametros:
     - `HidD_SetFeature(HidDevice, ReportId, *Buffer, BufferLength)`
   - Click en la llamada y ver el parametro `Buffer` (hex)
   - **Los primeros 16 bytes son tu header HID**

7. **Pegame los bytes** y actualizo `KX500_Lite.js`.

#### Como interpretar los bytes

Patron tipico de un feature report RGB:
```
[ReportID=0x00] [Command=0x08?] [Param1=0x00] [Param2=0x00] [More params...] [RGB data...]
```

Por ejemplo:
- SinoWealth: `06 08 00 00 01 00 7A 01` + RGB
- Redragon K626: `08 0A 7A 01` + RGB
- Corsair: `00 00 00 00 00 00 00` + RGB
- RAW (sin header): solo RGB

**Lo que mas importa:** los primeros 1-2 bytes son el "command ID" del feature report. Despues viene el padding/zona, y finalmente los 312 bytes RGB (104 keys * 3).

---

### Metodo B: xperf + ETW (built-in Windows, mas tecnico)

**Tiempo estimado:** 30-60 min

Ventaja: viene preinstalado con Windows Performance Toolkit.

```powershell
# 1. Iniciar trace con USB provider
xperf -on PROC_THREAD+LOADER+Microsoft-Windows-USB-USBHUB -stackwalk USB

# 2. Lanzar driver oficial y aplicar un color

# 3. Detener trace
xperf -d C:\temp\usb-capture.etl

# 4. Parsear el ETL
xperf -i C:\temp\usb-capture.etl -o C:\temp\usb-capture.txt -a hid

# 5. Buscar las transferencias al KX-500 en el .txt
```

Limitaciones:
- xperf no captura el contenido del buffer HID feature report
- Solo ve "se enviaron N bytes al endpoint X del dispositivo Y"
- Sirve para confirmar QUE se envio algo, pero no el CONTENIDO

---

### Metodo C: USBPcap + Wireshark (el metodo que ya tenias)

**Si funciona correctamente:**
1. Wireshark con USBPcap activo
2. Capturar filtro: `usb.src == "host" && usb.device_address == 1` (o el KX-500)
3. Ver los USB HID DATA packets en `Leftover Capture Data`

**Problemas comunes que Erik puede haber tenido:**
- USBPcap requiere reiniciar despues de instalar
- Wireshark a veces filtra paquetes HID feature reports como "leftover capture data" — click derecho → "Decode As..." → "USBHID" para verlos como HID
- Solo captura **bulk transfers y control transfers grandes**; feature reports HID pequenas (< 64 bytes) a veces requieren captura especifica

---

## Que hacer cuando tengamos los bytes

Si API Monitor captura `06 08 00 00 01 00 7A 01` → ya esta, es SinoWealth
Si captura otra cosa:

1. Editar `KX500_Lite.js` en la funcion `buildFrame()` (o `PROTOCOL_PRESETS`)
2. Cambiar el header al que capturaste
3. Si el tamano es diferente (320 bytes vs 520 vs 64), ajustar `reportSize`
4. `npm test` para verificar que todo compila
5. Reiniciar SignalRGB

---

## Archivos de soporte

| Archivo | Para que |
|---|---|
| `tools/API-Monitor/apimonitor-x64.exe` | API Monitor (Metodo A) |
| `tools/USBPcapSetup-1.5.4.0.exe` | Driver USBPcap (Metodo C) |
| `tools/Wireshark-4.6.8-x64.exe` | Wireshark (Metodo C) |
| `examples/api-monitor-capture.ps1` | Script de automatizacion API Monitor |
| `examples/wireshark-capture-guide.md` | Guia detallada Metodo C |